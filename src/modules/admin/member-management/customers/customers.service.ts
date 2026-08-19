import {
  ChatMessageType,
  EstimateRequestHistoryType,
  EstimateRequestStatus,
  NotificationType,
  RefreshTokenRevokedReason,
  RefreshTokenSessionType,
  SuspensionAction,
  type Prisma,
} from "@prisma/client";

import { AppError } from "../../../../lib/app-error";
import { authRepository } from "../../../auth/auth.repository";
import { disconnectUserSockets } from "../../../../socket";
import { buildPagination } from "../../../../utils/pagination.util";
import { runTransaction } from "../../../../utils/transaction";

import { memberRepository } from "../member.repository";
import {
  assertAdminCanChangeMemberStatus,
  resolveIsActiveForSuspensionAction,
} from "../member.policy";
import { MEMBER_STATUS } from "../member-status.constants";

import { customersRepository } from "./customers.repository";
import { customersStatusRepository } from "./customers-status.repository";
import { toCustomerDetail, toCustomerListItem } from "./customers.mapper";

import type { UpdateMemberStatusBody } from "../member-status.validator";
import type {
  CustomerDetail,
  ListCustomerQuery,
  UpdateCustomerStatusResponse,
} from "./customers.type";

export const customersService = {
  /** 관리자용 일반 고객(CUSTOMER) 목록을 조회합니다. */
  async getCustomerList(query: ListCustomerQuery) {
    const { page, limit } = query;

    const sorts = query.sorts?.length ? query.sorts : ["CREATED_AT_DESC"];

    const { customers, totalCount } = await customersRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      sorts,
      filters: query,
    });

    return {
      items: customers.map(toCustomerListItem),
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /** 관리자용 일반 고객(CUSTOMER) 상세를 조회합니다. */
  async getCustomerDetail(customerId: string): Promise<CustomerDetail> {
    const customer = await customersRepository.findCustomerById(customerId);

    if (!customer) {
      throw new AppError("USER_NOT_FOUND");
    }

    const [estimateHistory, reviewHistory, filedReports, receivedReports, suspensionHistory] =
      await Promise.all([
        customersRepository.findEstimateHistory({ customerId }),
        customersRepository.findReviewHistory({ customerId }),
        customersRepository.findFiledReportHistory({ customerId }),
        customersRepository.findReceivedReportHistory({ customerId }),
        memberRepository.findSuspensionHistory({ memberId: customerId }),
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
    input: UpdateMemberStatusBody;
  }): Promise<UpdateCustomerStatusResponse> {
    assertAdminCanChangeMemberStatus(customerId, adminId);

    // 상태 변경과 정지 후속 DB 작업(견적 요청/견적 상태, 이력·알림·토큰 폐기)을 하나의 트랜잭션으로 처리
    const result = await runTransaction<UpdateCustomerStatusResponse>(async (tx) => {
      const customer = await customersStatusRepository.findCustomerForStatusChange(customerId, tx);

      if (!customer) {
        throw new AppError("USER_NOT_FOUND");
      }

      const shouldBeActive = resolveIsActiveForSuspensionAction(input.action);

      // 이미 요청한 상태라면 다시 변경하지 않도록 현재 상태를 where 조건에 포함
      const { count } = await customersStatusRepository.updateCustomerIsActiveIfCurrent(
        { customerId, isActive: shouldBeActive },
        tx,
      );

      if (count === 0) {
        throw new AppError("CUSTOMER_STATUS_ALREADY_PROCESSED");
      }

      const now = new Date();

      if (input.action === SuspensionAction.SUSPEND) {
        // 해당 고객의 활성 PENDING·OPEN 견적 요청 행을 잠그고 ID를 가져옴
        // 잠근 뒤 알림·이력 생성에 필요한 상세 정보 조회
        const lockedRequestIds =
          await customersStatusRepository.lockCancelableRequestsForSuspension(customerId, tx);
        const cancelableRequests =
          await customersStatusRepository.findCancelableRequestsForSuspension(lockedRequestIds, tx);
        // 실제 취소 쿼리에 필요한 숫자 ID 배열만 추출
        const requestIds = cancelableRequests.map((request) => request.id);

        if (requestIds.length > 0) {
          // 상태 조건을 다시 확인해 여전히 PENDING·OPEN이고 활성된 요청만 취소한 후, 실제로 취소된 요청 ID만 반환받음
          const canceledRequestIds =
            await customersStatusRepository.cancelPendingOrOpenEstimateRequests(
              requestIds,
              now,
              tx,
            );
          // 실제 취소된 요청의 상세 정보만 후속 이력·알림 생성에 사용
          const canceledRequestIdSet = new Set(canceledRequestIds.map((request) => request.id));
          const canceledRequests = cancelableRequests.filter((request) =>
            canceledRequestIdSet.has(request.id),
          );

          // 각 요청에 연결된 모든 채팅방에 SYSTEM 메시지 생성
          const systemMessages = canceledRequests.flatMap((request) =>
            request.chatRooms.map((room) => ({
              roomId: room.id,
              senderId: null,
              type: ChatMessageType.SYSTEM,
              content: "고객의 이용 제한으로 견적 요청이 취소되었습니다.",
            })),
          );

          // 이미 견적을 보낸 기사와 지정 견적 대상으로 선택된 기사에게 알림 전송
          const notifications = canceledRequests.flatMap((request) => {
            // 한 기사가 견적·지정 대상에 모두 포함될 수 있으므로 Set으로 ID를 중복 제거해 한 번만 알림
            const moverIds = new Set([
              ...request.estimates.map((estimate) => estimate.moverId),
              ...request.designatedMovers.map((designation) => designation.moverId),
            ]);

            return [...moverIds].map((moverId) => ({
              userId: moverId,
              type: NotificationType.ESTIMATE_REQUEST_CANCELED_BY_ACCOUNT_SUSPENSION,
              title: "견적 요청 취소",
              content: "견적 요청",
              linkUrl: null,
              expiresAt: null,
              sourceId: `admin-suspend:${customerId}:${String(request.id)}`,
            }));
          });

          // 견적 요청 이력에 취소 전 상태와 변경 후 상태를 남김
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

          // 취소된 견적 요청에 연결된 견적·수정 요청을 정리하고, 이력·메시지·알림을 함께 저장
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

      // 정지·해제 모두 감사용 이력과 운영 활동 로그를 남김
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
        // 새 토큰 재발급을 막아 정지된 고객이 즉시 다시 인증되도록 함
        await authRepository.revokeAllRefreshTokensByUserId(
          customerId,
          RefreshTokenSessionType.USER,
          RefreshTokenRevokedReason.FORCED,
          tx,
        );
      }

      return {
        id: customerId,
        status: shouldBeActive ? MEMBER_STATUS.ACTIVE : MEMBER_STATUS.SUSPENDED,
        suspension,
      };
    });

    // DB 트랜잭션이 커밋된 뒤에 기존 실시간 소켓 연결 종료
    if (input.action === SuspensionAction.SUSPEND) {
      disconnectUserSockets(customerId);
    }

    return result;
  },
};
