import {
  ChatMessageType,
  EstimateRequestHistoryType,
  EstimateRequestStatus,
  NotificationType,
  RefreshTokenSessionType,
  SuspensionAction,
  UserRole,
  type Prisma,
} from "@prisma/client";

import { ERROR_CODES } from "../../../../constants/error-code";
import { AppError } from "../../../../lib/app-error";
import { authRepository } from "../../../auth/auth.repository";
import { disconnectUserSockets } from "../../../../socket";
import { buildPagination } from "../../../../utils/pagination.util";
import { runTransaction } from "../../../../utils/transaction";

import { customersRepository } from "./customers.repository";
import { customersStatusRepository } from "./customers-status.repository";
import { buildMemberStatusWhere } from "../member-status.policy";
import { MEMBER_STATUS } from "../member-status.constants";
import { toCustomerDetail, toCustomerListItem } from "./customers.mapper";
import type {
  CustomerDetail,
  ListCustomerQuery,
  UpdateCustomerStatusBody,
  UpdateCustomerStatusResponse,
} from "./customers.type";

/**
 * KST(Asia/Seoul) 달력 날짜의 시작 시각을 UTC로 변환합니다.
 * DB의 createdAt은 UTC timestamp로 저장되므로, 관리자 화면의 날짜 기준에 맞춰 조회 범위만 UTC로 변환합니다.
 */
export function toKstStartOfDay(date: string): Date {
  const [year = NaN, month = NaN, day = NaN] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, -9));
}

/** KST 달력 날짜의 마지막 시각을 UTC로 변환합니다. */
export function toKstEndOfDay(date: string): Date {
  const [year = NaN, month = NaN, day = NaN] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, 14, 59, 59, 999));
}

function buildCustomerListWhere(query: ListCustomerQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    role: UserRole.CUSTOMER,
    ...buildMemberStatusWhere(query.status),
  };

  if (query.keyword !== undefined) {
    where.OR = [
      { name: { contains: query.keyword, mode: "insensitive" } },
      { email: { contains: query.keyword, mode: "insensitive" } },
    ];
  }

  if (query.fromDate || query.toDate) {
    where.createdAt = {
      ...(query.fromDate ? { gte: toKstStartOfDay(query.fromDate) } : {}),
      ...(query.toDate ? { lte: toKstEndOfDay(query.toDate) } : {}),
    };
  }

  return where;
}

export const customersService = {
  /**
   * 관리자용 일반 고객(CUSTOMER) 목록을 조회합니다.
   * status 미지정 시 탈퇴 회원은 제외되며, createdAt DESC 로 정렬됩니다.
   */
  async getCustomerList(query: ListCustomerQuery) {
    const { page, limit } = query;

    const { customers, totalCount } = await customersRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where: buildCustomerListWhere(query),
    });

    return {
      items: customers.map(toCustomerListItem),
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /**
   * 관리자용 일반 고객(CUSTOMER) 상세를 조회합니다.
   * Mover/존재하지 않는 id 는 USER_NOT_FOUND, 탈퇴 회원은 조회 가능합니다.
   */
  async getCustomerDetail(customerId: string): Promise<CustomerDetail> {
    const customer = await customersRepository.findCustomerById(customerId);

    if (!customer) {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND.code);
    }

    const [estimateHistory, reviewHistory, filedReports, receivedReports, suspensionHistory] =
      await Promise.all([
        customersRepository.findEstimateHistory({ customerId }),
        customersRepository.findReviewHistory({ customerId }),
        customersRepository.findFiledReportHistory({ customerId }),
        customersRepository.findReceivedReportHistory({ customerId }),
        customersRepository.findSuspensionHistory({ customerId }),
      ]);

    return toCustomerDetail(customer, {
      estimateHistory,
      reviewHistory,
      filedReports,
      receivedReports,
      suspensionHistory,
    });
  },

  /**
   * 관리자 고객의 정지·해제를 처리합니다.
   * 정지 시 취소 가능한 견적 요청과 미확정 견적을 정리하고, 관련 이력·알림을 함께 저장합니다.
   */
  async updateCustomerStatus({
    customerId,
    adminId,
    input,
  }: {
    customerId: string;
    adminId: string;
    input: UpdateCustomerStatusBody;
  }): Promise<UpdateCustomerStatusResponse> {
    if (customerId === adminId) {
      throw new AppError(ERROR_CODES.SELF_ACTION_NOT_ALLOWED.code);
    }

    const result = await runTransaction<UpdateCustomerStatusResponse>(async (tx) => {
      const customer = await customersStatusRepository.findCustomerForStatusChange(customerId, tx);

      if (!customer) {
        throw new AppError(ERROR_CODES.USER_NOT_FOUND.code);
      }

      const shouldBeActive = input.action === SuspensionAction.RELEASE;

      // 현재 상태를 where 조건에 포함해, 동시 정지/해제 요청 중 하나만 상태를 변경합니다.
      const { count } = await customersStatusRepository.updateCustomerIsActiveIfCurrent(
        { customerId, isActive: shouldBeActive },
        tx,
      );

      if (count === 0) {
        throw new AppError(ERROR_CODES.CUSTOMER_STATUS_ALREADY_PROCESSED.code);
      }

      const now = new Date();

      if (input.action === SuspensionAction.SUSPEND) {
        // 요청 행을 먼저 잠가 견적 전송·고객 직접 취소와 상태 변경을 직렬화합니다.
        const lockedRequestIds =
          await customersStatusRepository.lockCancelableRequestsForSuspension(customerId, tx);
        const cancelableRequests =
          await customersStatusRepository.findCancelableRequestsForSuspension(lockedRequestIds, tx);
        const requestIds = cancelableRequests.map((request) => request.id);

        if (requestIds.length > 0) {
          const canceledRequestIds =
            await customersStatusRepository.cancelPendingOrOpenEstimateRequests(
              requestIds,
              now,
              tx,
            );
          // 실제로 취소 선점에 성공한 요청만 후속 알림·이력 처리 대상으로 삼습니다.
          const canceledRequestIdSet = new Set(canceledRequestIds.map((request) => request.id));
          const canceledRequests = cancelableRequests.filter((request) =>
            canceledRequestIdSet.has(request.id),
          );

          const systemMessages = canceledRequests.flatMap((request) =>
            request.chatRooms.map((room) => ({
              roomId: room.id,
              senderId: null,
              type: ChatMessageType.SYSTEM,
              content: "고객의 이용 제한으로 견적 요청이 취소되었습니다.",
            })),
          );
          const notifications = canceledRequests.flatMap((request) => {
            const moverIds = new Set([
              ...request.estimates.map((estimate) => estimate.moverId),
              ...request.designatedMovers.map((designation) => designation.moverId),
            ]);

            return [...moverIds].map((moverId) => ({
              userId: moverId,
              type: NotificationType.ESTIMATE_REQUEST_CANCELED_BY_ACCOUNT_SUSPENSION,
              title: "견적 요청 취소",
              // 프론트 알림 템플릿의 강조 대상어만 전달합니다.
              content: "견적 요청",
              linkUrl: null,
              expiresAt: null,
              sourceId: `admin-suspend:${customerId}:${String(request.id)}`,
            }));
          });
          const histories: Prisma.EstimateRequestHistoryCreateManyInput[] = canceledRequests.map(
            (request) => ({
              estimateRequestId: request.id,
              changedBy: adminId,
              type: EstimateRequestHistoryType.CANCELED,
              previousData: { status: request.status, isActive: request.isActive },
              changedData: {
                status: EstimateRequestStatus.CANCELED,
                isActive: false,
                canceledAt: now.toISOString(),
              },
            }),
          );

          await Promise.all([
            customersStatusRepository.cancelSentEstimates(
              canceledRequestIds.map((request) => request.id),
              now,
              tx,
            ),
            customersStatusRepository.cancelPendingEstimateRevisions(
              canceledRequestIds.map((request) => request.id),
              tx,
            ),
            customersStatusRepository.createEstimateRequestHistories(histories, tx),
            customersStatusRepository.createSystemMessages(systemMessages, tx),
            customersStatusRepository.createNotifications(notifications, tx),
          ]);
        }
      }

      const [suspension] = await Promise.all([
        customersStatusRepository.createCustomerSuspension(
          {
            customerId,
            adminId,
            action: input.action,
            reason: input.reason,
            ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
          },
          tx,
        ),
        customersStatusRepository.createCustomerStatusActivityLog(
          { customerId, adminId, action: input.action, reason: input.reason, createdAt: now },
          tx,
        ),
      ]);

      if (input.action === SuspensionAction.SUSPEND) {
        await authRepository.revokeAllRefreshTokensByUserId(
          customerId,
          RefreshTokenSessionType.USER,
          tx,
        );
      }

      return {
        id: customerId,
        status: shouldBeActive ? MEMBER_STATUS.ACTIVE : MEMBER_STATUS.SUSPENDED,
        suspension,
      };
    });

    // DB 트랜잭션이 커밋된 뒤에만 기존 실시간 연결을 종료합니다.
    if (input.action === SuspensionAction.SUSPEND) {
      disconnectUserSockets(customerId);
    }

    return result;
  },
};
