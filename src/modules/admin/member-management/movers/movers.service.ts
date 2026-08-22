import {
  ChatMessageType,
  NotificationType,
  RefreshTokenRevokedReason,
  RefreshTokenSessionType,
  SuspensionAction,
  type Prisma,
} from "@prisma/client";

import { buildPagination } from "../../../../utils/pagination.util";
import { authRepository } from "../../../auth/auth.repository";
import { notificationService } from "../../../notification/notification.service";
import { AppError } from "../../../../lib/app-error";
import { disconnectUserSockets, emitSystemChatMessages } from "../../../../socket";
import { runTransaction } from "../../../../utils/transaction";

import { DEFAULT_MEMBER_LIST_SORT } from "../member-list.validator";
import { MEMBER_STATUS } from "../member-status.constants";
import {
  assertAdminCanChangeMemberStatus,
  resolveIsActiveForSuspensionAction,
} from "../member.policy";
import { memberRepository } from "../member.repository";

import { toMoverDetail, toMoverListItem } from "./movers.mapper";
import { moversRepository } from "./movers.repository";
import { moversStatusRepository } from "./movers-status.repository";

import type { UpdateMemberStatusBody } from "../member-status.validator";
import type { ListMoverQuery, MoverDetail, UpdateMoverStatusResponse } from "./movers.type";

export const moversService = {
  /** 관리자용 기사(MOVER) 목록을 조회합니다. */
  async getMoverList(query: ListMoverQuery) {
    const { page, limit } = query;

    const sorts = query.sorts?.length ? query.sorts : [DEFAULT_MEMBER_LIST_SORT];

    const { movers, totalCount } = await moversRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      sorts,
      filters: query,
    });

    return {
      items: movers.map(toMoverListItem),
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /** 관리자용 기사(MOVER) 상세와 주요 활동 이력을 조회합니다. */
  async getMoverDetail(moverId: string): Promise<MoverDetail> {
    const mover = await moversRepository.findMoverById(moverId);

    if (!mover) {
      throw new AppError("MOVER_NOT_FOUND");
    }

    const [
      inProgressEstimateHistory,
      recentEstimateHistory,
      reviewHistory,
      filedReports,
      receivedReports,
      suspensionHistory,
      inquiryHistory,
    ] = await Promise.all([
      moversRepository.findInProgressEstimateHistory({ moverId }),
      moversRepository.findRecentEstimateHistory({ moverId }),
      moversRepository.findReviewHistory({ moverId }),
      moversRepository.findFiledReportHistory({ moverId }),
      moversRepository.findReceivedReportHistory({ moverId }),
      memberRepository.findSuspensionHistory({ memberId: moverId }),
      memberRepository.findInquiryHistory({ memberId: moverId }),
    ]);

    return toMoverDetail(mover, {
      inProgressEstimateHistory,
      recentEstimateHistory,
      reviewHistory,
      filedReports,
      receivedReports,
      suspensionHistory,
      inquiryHistory,
    });
  },

  /** 관리자 기사 정지·해제를 처리합니다. 정지 시 전송된 견적만 취소합니다. */
  async updateMoverStatus({
    moverId,
    adminId,
    input,
  }: {
    moverId: string;
    adminId: string;
    input: UpdateMemberStatusBody;
  }): Promise<UpdateMoverStatusResponse> {
    assertAdminCanChangeMemberStatus(moverId, adminId);

    const { result, createdNotifications, createdSystemMessages } = await runTransaction(
      async (tx) => {
        // 트랜잭션 안에서 실제로 생성된 알림들만 모아둠. 트랜잭션 커밋 후 SSE로 전송하기 위함.
        const createdNotifications: Awaited<
          ReturnType<typeof moversStatusRepository.createNotifications>
        > = [];
        const createdSystemMessages: Awaited<
          ReturnType<typeof moversStatusRepository.createSystemMessages>
        > = [];

        const mover = await moversStatusRepository.findMoverForStatusChange(moverId, tx);
        if (!mover) {
          throw new AppError("MOVER_NOT_FOUND");
        }

        // 현재 상태가 변경 대상일 때만 변경해 중복 요청을 방지
        const shouldBeActive = resolveIsActiveForSuspensionAction(input.action);
        const { count } = await moversStatusRepository.updateMoverIsActiveIfCurrent(
          { moverId, isActive: shouldBeActive },
          tx,
        );
        if (count === 0) {
          throw new AppError("MOVER_STATUS_ALREADY_PROCESSED");
        }

        const now = new Date();

        // SUSPEND인 경우 진행 중인 견적과 견적 수정 요청을 취소하고, 알림 및 이력 생성
        // RELEASE인 경우에는 정지 해제 이력(UserSuspension)과 관리자 활동 로그 저장만 수행
        if (input.action === SuspensionAction.SUSPEND) {
          // 해당 기사가 OPEN 견적 요청에 보낸 SENT 견적 행을 잠근 뒤 뒤 알림·이력 생성에 필요한 상세 정보 조회
          const lockedEstimateIds = await moversStatusRepository.lockSentEstimatesForSuspension(
            moverId,
            tx,
          );
          const sentEstimates = await moversStatusRepository.findSentEstimatesForSuspension(
            lockedEstimateIds,
            tx,
          );

          if (sentEstimates.length > 0) {
            // 상태 조건을 다시 확인해 여전히 취소 가능한 견적만 취소 후, 취소된 견적 ID 반환
            const canceledEstimateRows =
              await moversStatusRepository.cancelSentEstimatesForSuspension(
                sentEstimates.map((estimate) => estimate.id),
                now,
                tx,
              );
            const canceledEstimateIdSet = new Set(
              canceledEstimateRows.map((estimate) => estimate.id),
            );
            // 처음 조회했던 sentEstimates에서 실제로 취소에 성공한견적만 남김
            const canceledEstimates = sentEstimates.filter((estimate) =>
              canceledEstimateIdSet.has(estimate.id),
            );

            // 연결된 채팅방에 SYSTEM 메시지 생성 및 lastMessageAt 갱신
            const chatRoomIds = canceledEstimates.flatMap((estimate) =>
              estimate.chatRoom ? [estimate.chatRoom.id] : [],
            );
            const systemMessages: Prisma.ChatMessageCreateManyInput[] = chatRoomIds.map(
              (roomId) => ({
                roomId,
                senderId: null,
                type: ChatMessageType.SYSTEM,
                content: "기사님의 이용 제한으로 견적이 취소되었습니다.",
              }),
            );

            // 고객 알림을 DB에 저장
            const notifications: Prisma.NotificationCreateManyInput[] = canceledEstimates.map(
              (estimate) => ({
                userId: estimate.estimateRequest.customerId,
                type: NotificationType.ESTIMATE_CANCELED_BY_ACCOUNT_SUSPENSION,
                title: "견적 취소",
                content: "견적",
                linkUrl: null,
                expiresAt: null,
                sourceId: `admin-suspend-mover:${moverId}:${String(estimate.id)}`,
              }),
            );

            await moversStatusRepository.cancelPendingRevisions(
              canceledEstimates.map((estimate) => estimate.id),
              tx,
            );
            createdSystemMessages.push(
              ...(await moversStatusRepository.createSystemMessages(systemMessages, tx)),
            );
            await moversStatusRepository.updateChatRoomsLastMessageAt(chatRoomIds, now, tx);
            // createManyAndReturn을 통해 실제 INSERT된 알림만 받아, 이를 createdNotifications에 push함
            createdNotifications.push(
              ...(await moversStatusRepository.createNotifications(notifications, tx)),
            );
          }
        }

        const suspension = await moversStatusRepository.createMoverSuspension(
          {
            moverId,
            adminId,
            action: input.action,
            reason: input.reason,
            ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
          },
          tx,
        );
        await moversStatusRepository.createMoverStatusActivityLog(
          { moverId, adminId, action: input.action, reason: input.reason, createdAt: now },
          tx,
        );

        if (input.action === SuspensionAction.SUSPEND) {
          // 정지 후 기존 Refresh Token으로 Access Token을 재발급하지 못하도록 폐기
          await authRepository.revokeAllRefreshTokensByUserId(
            moverId,
            RefreshTokenSessionType.USER,
            RefreshTokenRevokedReason.FORCED,
            tx,
          );
        }

        return {
          result: {
            id: moverId,
            status: shouldBeActive ? MEMBER_STATUS.ACTIVE : MEMBER_STATUS.SUSPENDED,
            suspension,
          } satisfies UpdateMoverStatusResponse,
          createdNotifications,
          createdSystemMessages,
        };
      },
    );

    // 트랜잭션 커밋이 끝난 뒤에 기존 실시간 소켓 연결 종료
    if (input.action === SuspensionAction.SUSPEND) {
      disconnectUserSockets(moverId);
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
