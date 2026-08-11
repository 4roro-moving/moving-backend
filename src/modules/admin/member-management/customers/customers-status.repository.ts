import {
  EstimateRequestStatus,
  EstimateRevisionStatus,
  EstimateStatus,
  LogAction,
  LogTargetType,
  Prisma,
  UserRole,
} from "@prisma/client";
import type { SuspensionAction } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import type { DbClient } from "../../../../utils/transaction";

/** 고객 정지 시 함께 취소하는 견적 요청 상태입니다. ORM과 raw SQL에서 함께 사용합니다. */
const CANCELABLE_ESTIMATE_REQUEST_STATUSES: EstimateRequestStatus[] = [
  EstimateRequestStatus.PENDING,
  EstimateRequestStatus.OPEN,
];

/** 고객 상태 변경 및 정지 후속 처리에서 사용하는 DB 명령입니다. */
export const customersStatusRepository = {
  findCustomerForStatusChange(customerId: string, db: DbClient = prisma) {
    return db.user.findFirst({
      where: { id: customerId, role: UserRole.CUSTOMER, deletedAt: null },
      select: { id: true, isActive: true },
    });
  },

  updateCustomerIsActiveIfCurrent(
    { customerId, isActive }: { customerId: string; isActive: boolean },
    db: DbClient = prisma,
  ) {
    return db.user.updateMany({
      where: {
        id: customerId,
        role: UserRole.CUSTOMER,
        deletedAt: null,
        isActive: !isActive,
      },
      data: { isActive },
    });
  },

  /**
   * Prisma는 SELECT ... FOR UPDATE 행 잠금을 지원하지 않아 raw SQL을 사용합니다.
   * 정지 처리 중 견적 전송·고객 직접 취소와 경합하지 않도록 대상 요청 행을 잠급니다.
   */
  async lockCancelableRequestsForSuspension(
    customerId: string,
    db: Prisma.TransactionClient,
  ): Promise<number[]> {
    const rows = await db.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        SELECT id
        FROM estimate_requests
        WHERE customer_id = ${customerId}::uuid
          AND is_active = true
          AND status IN (${Prisma.join(CANCELABLE_ESTIMATE_REQUEST_STATUSES)})
        FOR UPDATE
      `,
    );

    return rows.map((row) => row.id);
  },

  findCancelableRequestsForSuspension(requestIds: number[], db: DbClient = prisma) {
    return db.estimateRequest.findMany({
      where: {
        id: { in: requestIds },
        status: { in: CANCELABLE_ESTIMATE_REQUEST_STATUSES },
        isActive: true,
      },
      select: {
        id: true,
        status: true,
        isActive: true,
        estimates: { where: { status: EstimateStatus.SENT }, select: { moverId: true } },
        designatedMovers: { select: { moverId: true } },
        chatRooms: { select: { id: true } },
      },
    });
  },

  cancelSentEstimates(requestIds: number[], canceledAt: Date, db: DbClient = prisma) {
    return db.estimate.updateMany({
      where: { estimateRequestId: { in: requestIds }, status: EstimateStatus.SENT },
      data: { status: EstimateStatus.CANCELED, canceledAt },
    });
  },

  cancelPendingEstimateRevisions(requestIds: number[], db: DbClient = prisma) {
    return db.estimateRevision.updateMany({
      where: {
        status: EstimateRevisionStatus.PENDING,
        estimate: { estimateRequestId: { in: requestIds } },
      },
      data: { status: EstimateRevisionStatus.CANCELED },
    });
  },

  cancelPendingOrOpenEstimateRequests(
    requestIds: number[],
    canceledAt: Date,
    db: DbClient = prisma,
  ) {
    // 조건부 UPDATE와 RETURNING으로 실제 취소에 성공한 요청만 식별합니다.
    // 후속 이력·알림은 이 결과에 대해서만 생성합니다.
    return db.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        UPDATE estimate_requests
        SET status = ${EstimateRequestStatus.CANCELED}, is_active = false, canceled_at = ${canceledAt}
        WHERE id IN (${Prisma.join(requestIds)})
          AND status IN (${Prisma.join(CANCELABLE_ESTIMATE_REQUEST_STATUSES)})
          AND is_active = true
        RETURNING id
      `,
    );
  },

  createEstimateRequestHistories(
    data: Prisma.EstimateRequestHistoryCreateManyInput[],
    db: DbClient = prisma,
  ) {
    return db.estimateRequestHistory.createMany({ data });
  },

  createSystemMessages(data: Prisma.ChatMessageCreateManyInput[], db: DbClient = prisma) {
    return db.chatMessage.createMany({ data });
  },

  createNotifications(data: Prisma.NotificationCreateManyInput[], db: DbClient = prisma) {
    return db.notification.createMany({ data, skipDuplicates: true });
  },

  createCustomerSuspension(
    {
      customerId,
      adminId,
      action,
      reason,
      internalNote,
    }: {
      customerId: string;
      adminId: string;
      action: SuspensionAction;
      reason: string;
      internalNote?: string;
    },
    db: DbClient = prisma,
  ) {
    return db.userSuspension.create({
      data: {
        userId: customerId,
        adminId,
        action,
        reason,
        ...(internalNote !== undefined ? { internalNote } : {}),
      },
      select: { id: true, action: true, reason: true, adminId: true, createdAt: true },
    });
  },

  createCustomerStatusActivityLog(
    {
      customerId,
      adminId,
      action,
      reason,
      createdAt,
    }: {
      customerId: string;
      adminId: string;
      action: SuspensionAction;
      reason: string;
      createdAt: Date;
    },
    db: DbClient = prisma,
  ) {
    return db.activityLog.create({
      data: {
        actorId: adminId,
        actorRole: UserRole.ADMIN,
        action: LogAction.UPDATE,
        targetType: LogTargetType.USER,
        targetId: customerId,
        memo: `${action}: ${reason}`,
        createdAt,
      },
    });
  },
};
