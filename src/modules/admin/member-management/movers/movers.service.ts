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
import { memberRepository } from "../member.repository";
import { AppError } from "../../../../lib/app-error";
import { disconnectUserSockets } from "../../../../socket";
import { runTransaction } from "../../../../utils/transaction";
import {
  assertAdminCanChangeMemberStatus,
  resolveIsActiveForSuspensionAction,
} from "../member.policy";
import { MEMBER_STATUS } from "../member-status.constants";
import { toMoverDetail, toMoverListItem } from "./movers.mapper";
import { moversRepository } from "./movers.repository";
import { moversStatusRepository } from "./movers-status.repository";
import type {
  ListMoverQuery,
  MoverDetail,
  UpdateMoverStatusBody,
  UpdateMoverStatusResponse,
} from "./movers.type";

const MOVER_SUSPENSION_SYSTEM_MESSAGE = "기사님의 이용 제한으로 견적이 취소되었습니다.";

export const moversService = {
  /** 관리자용 기사(MOVER) 목록을 조회합니다. */
  async getMoverList(query: ListMoverQuery) {
    const { page, limit } = query;

    const sorts = query.sorts?.length ? query.sorts : ["CREATED_AT_DESC"];

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
      receivedReports,
      suspensionHistory,
    ] = await Promise.all([
      moversRepository.findInProgressEstimateHistory({ moverId }),
      moversRepository.findRecentEstimateHistory({ moverId }),
      moversRepository.findReviewHistory({ moverId }),
      moversRepository.findReceivedReportHistory({ moverId }),
      memberRepository.findSuspensionHistory({ memberId: moverId }),
    ]);

    return toMoverDetail(mover, {
      inProgressEstimateHistory,
      recentEstimateHistory,
      reviewHistory,
      receivedReports,
      suspensionHistory,
    });
  },

  /** 관리자 기사 정지·해제를 처리합니다. 정지 시 아직 전송된 견적만 취소합니다. */
  async updateMoverStatus({
    moverId,
    adminId,
    input,
  }: {
    moverId: string;
    adminId: string;
    input: UpdateMoverStatusBody;
  }): Promise<UpdateMoverStatusResponse> {
    assertAdminCanChangeMemberStatus(moverId, adminId);

    const result = await runTransaction<UpdateMoverStatusResponse>(async (tx) => {
      const mover = await moversStatusRepository.findMoverForStatusChange(moverId, tx);

      if (!mover) {
        throw new AppError("MOVER_NOT_FOUND");
      }

      const shouldBeActive = resolveIsActiveForSuspensionAction(input.action);
      const { count } = await moversStatusRepository.updateMoverIsActiveIfCurrent(
        { moverId, isActive: shouldBeActive },
        tx,
      );

      if (count === 0) {
        throw new AppError("MOVER_STATUS_ALREADY_PROCESSED");
      }

      const now = new Date();

      if (input.action === SuspensionAction.SUSPEND) {
        const lockedEstimateIds = await moversStatusRepository.lockSentEstimatesForSuspension(
          moverId,
          tx,
        );
        const sentEstimates = await moversStatusRepository.findSentEstimatesForSuspension(
          lockedEstimateIds,
          tx,
        );

        if (sentEstimates.length > 0) {
          const canceledEstimateRows =
            await moversStatusRepository.cancelSentEstimatesForSuspension(
              sentEstimates.map((estimate) => estimate.id),
              now,
              tx,
            );
          const canceledEstimateIdSet = new Set(
            canceledEstimateRows.map((estimate) => estimate.id),
          );
          const canceledEstimates = sentEstimates.filter((estimate) =>
            canceledEstimateIdSet.has(estimate.id),
          );
          const chatRoomIds = canceledEstimates.flatMap((estimate) =>
            estimate.chatRoom ? [estimate.chatRoom.id] : [],
          );
          const systemMessages: Prisma.ChatMessageCreateManyInput[] = chatRoomIds.map((roomId) => ({
            roomId,
            senderId: null,
            type: ChatMessageType.SYSTEM,
            content: MOVER_SUSPENSION_SYSTEM_MESSAGE,
          }));
          const notifications: Prisma.NotificationCreateManyInput[] = canceledEstimates.map(
            (estimate) => ({
              userId: estimate.estimateRequest.customerId,
              type: NotificationType.ESTIMATE_CANCELED_BY_ACCOUNT_SUSPENSION,
              title: "견적 취소",
              content: "기사님의 이용 제한으로 견적이 취소되었습니다.",
              linkUrl: null,
              expiresAt: null,
              sourceId: `admin-suspend-mover:${moverId}:${String(estimate.id)}`,
            }),
          );

          await Promise.all([
            moversStatusRepository.cancelPendingRevisions(
              canceledEstimates.map((estimate) => estimate.id),
              tx,
            ),
            moversStatusRepository.createSystemMessages(systemMessages, tx),
            moversStatusRepository.updateChatRoomsLastMessageAt(chatRoomIds, now, tx),
            moversStatusRepository.createNotifications(notifications, tx),
          ]);
        }
      }

      const [suspension] = await Promise.all([
        moversStatusRepository.createMoverSuspension(
          {
            moverId,
            adminId,
            action: input.action,
            reason: input.reason,
            ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
          },
          tx,
        ),
        moversStatusRepository.createMoverStatusActivityLog(
          { moverId, adminId, action: input.action, reason: input.reason, createdAt: now },
          tx,
        ),
      ]);

      if (input.action === SuspensionAction.SUSPEND) {
        await authRepository.revokeAllRefreshTokensByUserId(
          moverId,
          RefreshTokenSessionType.USER,
          RefreshTokenRevokedReason.FORCED,
          tx,
        );
      }

      return {
        id: moverId,
        status: shouldBeActive ? MEMBER_STATUS.ACTIVE : MEMBER_STATUS.SUSPENDED,
        suspension,
      };
    });

    if (input.action === SuspensionAction.SUSPEND) {
      disconnectUserSockets(moverId);
    }

    return result;
  },
};
