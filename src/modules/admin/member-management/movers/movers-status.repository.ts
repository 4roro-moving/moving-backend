import {
  EstimateRevisionStatus,
  EstimateRequestStatus,
  EstimateStatus,
  LogAction,
  LogTargetType,
  Prisma,
  UserRole,
  type SuspensionAction,
} from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import type { DbClient } from "../../../../utils/transaction";

const sentEstimateStatusSql = Prisma.sql`${EstimateStatus.SENT}::"EstimateStatus"`;
const openEstimateRequestStatusSql = Prisma.sql`${EstimateRequestStatus.OPEN}::"EstimateRequestStatus"`;

/** 기사 정지·해제와 정지 시 전송 견적 취소를 담당하는 저장소입니다. */
export const moversStatusRepository = {
  findMoverForStatusChange(moverId: string, db: DbClient = prisma) {
    return db.user.findFirst({
      where: { id: moverId, role: UserRole.MOVER, deletedAt: null },
      select: { id: true, isActive: true },
    });
  },

  updateMoverIsActiveIfCurrent(
    { moverId, isActive }: { moverId: string; isActive: boolean },
    db: DbClient = prisma,
  ) {
    return db.user.updateMany({
      where: { id: moverId, role: UserRole.MOVER, deletedAt: null, isActive: !isActive },
      data: { isActive },
    });
  },

  /** 고객 취소와 동시에 같은 SENT 견적을 변경하지 않도록 대상 견적 행을 잠급니다. */
  async lockSentEstimatesForSuspension(
    moverId: string,
    db: Prisma.TransactionClient,
  ): Promise<number[]> {
    const rows = await db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT e.id
      FROM estimates AS e
      INNER JOIN estimate_requests AS er ON er.id = e.estimate_request_id
      WHERE e.mover_id = ${moverId}::uuid
        AND e.status = ${sentEstimateStatusSql}
        AND er.status = ${openEstimateRequestStatusSql}
        AND er."isActive" = TRUE
      FOR UPDATE OF e
    `);

    return rows.map((row) => row.id);
  },

  findSentEstimatesForSuspension(estimateIds: number[], db: DbClient = prisma) {
    return db.estimate.findMany({
      where: {
        id: { in: estimateIds },
        status: EstimateStatus.SENT,
        estimateRequest: { status: EstimateRequestStatus.OPEN, isActive: true },
      },
      select: {
        id: true,
        estimateRequest: { select: { customerId: true } },
        chatRoom: { select: { id: true } },
      },
    });
  },

  /** 여전히 SENT이고 요청이 OPEN·활성 상태인 견적만 취소하고 실제 변경 ID를 반환합니다. */
  cancelSentEstimatesForSuspension(
    estimateIds: number[],
    canceledAt: Date,
    db: Prisma.TransactionClient,
  ) {
    return db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      UPDATE estimates AS e
      SET status = ${EstimateStatus.CANCELED}::"EstimateStatus",
          canceled_at = ${canceledAt}
      FROM estimate_requests AS er
      WHERE e.id IN (${Prisma.join(estimateIds)})
        AND e.estimate_request_id = er.id
        AND e.status = ${sentEstimateStatusSql}
        AND er.status = ${openEstimateRequestStatusSql}
        AND er."isActive" = TRUE
      RETURNING e.id
    `);
  },

  cancelPendingRevisions(estimateIds: number[], db: DbClient = prisma) {
    return db.estimateRevision.updateMany({
      where: { estimateId: { in: estimateIds }, status: EstimateRevisionStatus.PENDING },
      data: { status: EstimateRevisionStatus.CANCELED },
    });
  },

  createSystemMessages(data: Prisma.ChatMessageCreateManyInput[], db: DbClient = prisma) {
    return db.chatMessage.createMany({ data });
  },

  updateChatRoomsLastMessageAt(roomIds: number[], lastMessageAt: Date, db: DbClient = prisma) {
    return db.chatRoom.updateMany({ where: { id: { in: roomIds } }, data: { lastMessageAt } });
  },

  createNotifications(data: Prisma.NotificationCreateManyInput[], db: DbClient = prisma) {
    return db.notification.createMany({ data, skipDuplicates: true });
  },

  createMoverSuspension(
    data: {
      moverId: string;
      adminId: string;
      action: SuspensionAction;
      reason: string;
      internalNote?: string;
    },
    db: DbClient = prisma,
  ) {
    return db.userSuspension.create({
      data: {
        userId: data.moverId,
        adminId: data.adminId,
        action: data.action,
        reason: data.reason,
        ...(data.internalNote !== undefined ? { internalNote: data.internalNote } : {}),
      },
      select: { id: true, action: true, reason: true, adminId: true, createdAt: true },
    });
  },

  createMoverStatusActivityLog(
    data: {
      moverId: string;
      adminId: string;
      action: SuspensionAction;
      reason: string;
      createdAt: Date;
    },
    db: DbClient = prisma,
  ) {
    return db.activityLog.create({
      data: {
        actorId: data.adminId,
        actorRole: UserRole.ADMIN,
        action: LogAction.UPDATE,
        targetType: LogTargetType.USER,
        targetId: data.moverId,
        memo: `${data.action}: ${data.reason}`,
        createdAt: data.createdAt,
      },
    });
  },
};
