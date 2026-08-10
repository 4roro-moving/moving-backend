import type { Prisma } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

/** 관리자 취소 정책 검증 및 후속 처리에 필요한 확정 견적 조회 필드 */
const confirmedEstimateSelect = {
  id: true,
  estimateRequestId: true,
  moverId: true,
  status: true,
  estimateRequest: {
    select: {
      id: true,
      customerId: true,
      status: true,
      isActive: true,
      confirmedEstimateId: true,
    },
  },
  // 견적별 채팅방은 1개이므로, 취소 대상 견적의 채팅방만 조회합니다.
  chatRoom: { select: { id: true } },
} satisfies Prisma.EstimateSelect;

export type ConfirmedEstimateRow = Prisma.EstimateGetPayload<{
  select: typeof confirmedEstimateSelect;
}>;

export const adminEstimatesRepository = {
  /** 확정 거래 취소 대상의 현재 상태와 연결된 채팅방 조회 */
  findForCancellation(estimateId: number, db: DbClient = prisma) {
    return db.estimate.findUnique({ where: { id: estimateId }, select: confirmedEstimateSelect });
  },

  /**
   * 아직 취소되지 않은 확정 거래인 경우에만 견적 요청을 취소합니다.
   * 이미 다른 처리로 상태가 변경됐다면 수정하지 않습니다.
   */
  claimConfirmedEstimateRequestCancellation(
    estimateRequestId: number,
    estimateId: number,
    canceledAt: Date,
    db: DbClient = prisma,
  ) {
    return db.estimateRequest.updateMany({
      where: {
        id: estimateRequestId,
        status: "CONFIRMED",
        isActive: true,
        confirmedEstimateId: estimateId,
      },
      data: { status: "CANCELED", isActive: false, canceledAt },
    });
  },

  /** 확정 상태인 견적만 취소합니다. */
  cancelConfirmedEstimate(estimateId: number, canceledAt: Date, db: DbClient = prisma) {
    return db.estimate.updateMany({
      where: { id: estimateId, status: "CONFIRMED" },
      data: { status: "CANCELED", canceledAt },
    });
  },

  /** 취소된 거래에 더 이상 적용될 수 없는 PENDING 상태의 수정 요청을 종료합니다. */
  cancelPendingRevisions(estimateId: number, db: DbClient = prisma) {
    return db.estimateRevision.updateMany({
      where: { estimateId, status: "PENDING" },
      data: { status: "CANCELED" },
    });
  },

  /** 견적 요청 상태 변경 이력을 저장합니다. */
  createRequestCancellationHistory(
    data: Prisma.EstimateRequestHistoryUncheckedCreateInput,
    db: DbClient = prisma,
  ) {
    return db.estimateRequestHistory.create({ data });
  },

  /** 이미 존재하는 채팅방에만 관리자 SYSTEM 메시지를 추가합니다. */
  createSystemMessages(data: Prisma.ChatMessageCreateManyInput[], db: DbClient = prisma) {
    return db.chatMessage.createMany({ data });
  },

  /** SYSTEM 메시지 생성 뒤 채팅 목록이 최신 메시지 순으로 정렬되도록 갱신합니다. */
  updateChatRoomsLastMessageAt(roomIds: number[], lastMessageAt: Date, db: DbClient = prisma) {
    return db.chatRoom.updateMany({
      where: { id: { in: roomIds } },
      data: { lastMessageAt },
    });
  },

  /** 재시도 시 알림 중복 생성을 막습니다. */
  createNotifications(data: Prisma.NotificationCreateManyInput[], db: DbClient = prisma) {
    return db.notification.createMany({ data, skipDuplicates: true });
  },

  /** 관리자 취소 조치와 사유를 운영 감사 로그에 저장합니다. */
  createActivityLog(
    data: { adminId: string; estimateId: number; memo: string },
    db: DbClient = prisma,
  ) {
    return db.activityLog.create({
      data: {
        actorId: data.adminId,
        actorRole: "ADMIN",
        action: "UPDATE",
        targetType: "ESTIMATE",
        targetId: String(data.estimateId),
        memo: data.memo,
      },
    });
  },
};
