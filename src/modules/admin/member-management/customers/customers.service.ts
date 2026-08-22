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
import { notificationService } from "../../../notification/notification.service";
import { disconnectUserSockets, emitSystemChatMessages } from "../../../../socket";
import { buildPagination } from "../../../../utils/pagination.util";
import { runTransaction } from "../../../../utils/transaction";

import { DEFAULT_MEMBER_LIST_SORT } from "../member-list.validator";
import { MEMBER_STATUS } from "../member-status.constants";
import {
  assertAdminCanChangeMemberStatus,
  resolveIsActiveForSuspensionAction,
} from "../member.policy";
import { memberRepository } from "../member.repository";

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

    const sorts = query.sorts?.length ? query.sorts : [DEFAULT_MEMBER_LIST_SORT];

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

    const { result, createdNotifications, createdSystemMessages } = await runTransaction(
      async (tx) => {
        // 트랜잭션 안에서 실제로 생성된 알림들만 모아둠. 트랜잭션 커밋 후 SSE로 전송하기 위함.
        const createdNotifications: Awaited<
          ReturnType<typeof customersStatusRepository.createNotifications>
        > = [];
        const createdSystemMessages: Awaited<
          ReturnType<typeof customersStatusRepository.createSystemMessages>
        > = [];

        const customer = await customersStatusRepository.findCustomerForStatusChange(
          customerId,
          tx,
        );
        if (!customer) {
          throw new AppError("USER_NOT_FOUND");
        }

        // 현재 상태가 변경 대상일 때만 변경해 중복 요청을 방지
        const shouldBeActive = resolveIsActiveForSuspensionAction(input.action);
        const { count } = await customersStatusRepository.updateCustomerIsActiveIfCurrent(
          { customerId, isActive: shouldBeActive },
          tx,
        );
        if (count === 0) {
          throw new AppError("CUSTOMER_STATUS_ALREADY_PROCESSED");
        }

        const now = new Date();

        // SUSPEND일 때만 진행 중인 견적 요청을 정리
        if (input.action === SuspensionAction.SUSPEND) {
          // 해당 고객의 활성 PENDING·OPEN 견적 요청 행을 잠근 뒤 알림·이력 생성에 필요한 상세 정보 조회
          const lockedRequestIds =
            await customersStatusRepository.lockCancelableRequestsForSuspension(customerId, tx);
          const cancelableRequests =
            await customersStatusRepository.findCancelableRequestsForSuspension(
              lockedRequestIds,
              tx,
            );
          // 실제 취소 쿼리에 필요한 숫자 ID 배열만 추출
          const requestIds = cancelableRequests.map((request) => request.id);

          if (requestIds.length > 0) {
            // 상태 조건을 다시 확인해 여전히 취소 가능한 견적 요청만 취소 후, 취소된 견적 요청 ID 반환
            const canceledRequestIds =
              await customersStatusRepository.cancelPendingOrOpenEstimateRequests(
                requestIds,
                now,
                tx,
              );
            const canceledRequestIdSet = new Set(canceledRequestIds.map((request) => request.id));
            const canceledRequests = cancelableRequests.filter((request) =>
              canceledRequestIdSet.has(request.id),
            );

            // 취소된 견적 요청에 연결된 채팅방 ID 수집 후 SYSTEM 메시지 생성 및 lastMessageAt 갱신
            const chatRoomIds = canceledRequests.flatMap((request) =>
              request.chatRooms.map((room) => room.id),
            );
            const systemMessages = chatRoomIds.map((roomId) => ({
              roomId,
              senderId: null,
              type: ChatMessageType.SYSTEM,
              content: "고객의 이용 제한으로 견적 요청이 취소되었습니다.",
            }));

            // 이미 견적을 보낸 기사와 지정 견적 대상으로 선택된 기사에게 보낼 알림 생성
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

            // EstimateRequestHistory에 취소 전 상태와 변경 후 상태를 남김
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

            await customersStatusRepository.cancelSentEstimates(
              canceledRequestIds.map((request) => request.id),
              now,
              tx,
            );
            await customersStatusRepository.cancelPendingEstimateRevisions(
              canceledRequestIds.map((request) => request.id),
              tx,
            );
            await customersStatusRepository.createEstimateRequestHistories(histories, tx);
            createdSystemMessages.push(
              ...(await customersStatusRepository.createSystemMessages(systemMessages, tx)),
            );
            await customersStatusRepository.updateChatRoomsLastMessageAt(chatRoomIds, now, tx);
            // createManyAndReturn을 통해 실제 INSERT된 알림만 받아, 이를 createdNotifications에 push함
            createdNotifications.push(
              ...(await customersStatusRepository.createNotifications(notifications, tx)),
            );
          }
        }

        const suspension = await customersStatusRepository.createCustomerSuspension(
          {
            customerId,
            adminId,
            action: input.action,
            reason: input.reason,
            ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
          },
          tx,
        );

        await customersStatusRepository.createCustomerStatusActivityLog(
          { customerId, adminId, action: input.action, reason: input.reason, createdAt: now },
          tx,
        );

        if (input.action === SuspensionAction.SUSPEND) {
          // 정지 후 기존 Refresh Token으로 Access Token을 재발급하지 못하도록 폐기
          await authRepository.revokeAllRefreshTokensByUserId(
            customerId,
            RefreshTokenSessionType.USER,
            RefreshTokenRevokedReason.FORCED,
            tx,
          );
        }

        return {
          result: {
            id: customerId,
            status: shouldBeActive ? MEMBER_STATUS.ACTIVE : MEMBER_STATUS.SUSPENDED,
            suspension,
          } satisfies UpdateCustomerStatusResponse,
          createdNotifications,
          createdSystemMessages,
        };
      },
    );

    // 트랜잭션 커밋이 끝난 뒤에 기존 실시간 소켓 연결 종료
    if (input.action === SuspensionAction.SUSPEND) {
      disconnectUserSockets(customerId);
    }

    // 트랜잭션 커밋이 끝난 뒤에 실시간 알림 전송
    for (const { userId, ...notification } of createdNotifications) {
      notificationService.sendNotification(userId, notification);
    }
    emitSystemChatMessages(
      createdSystemMessages
        .filter((message) => message.type === ChatMessageType.SYSTEM)
        .map((message) => ({ ...message, type: "SYSTEM" as const })),
    );

    return result;
  },
};
