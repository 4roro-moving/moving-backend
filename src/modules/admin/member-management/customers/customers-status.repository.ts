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

/** raw SQL에서는 enum 파라미터가 text로 전달되므로 PostgreSQL enum 타입 캐스팅이 필요합니다. */
const cancelableEstimateRequestStatusSql = Prisma.join(
  CANCELABLE_ESTIMATE_REQUEST_STATUSES.map(
    (status) => Prisma.sql`${status}::"EstimateRequestStatus"`,
  ),
);

/**
 * 고객 정지·해제 시 실행하는 DB 작업입니다.
 * 목록·상세 조회용 customersRepository와 분리해 상태 변경, 견적 취소, 이력·알림 저장을 담당합니다.
 */
export const customersStatusRepository = {
  /**
   * 상태 변경 대상인 활성/정지 고객을 조회합니다.
   * 탈퇴 고객은 정지·해제할 수 없으므로 deletedAt이 null인 경우만 반환합니다.
   */
  findCustomerForStatusChange(customerId: string, db: DbClient = prisma) {
    return db.user.findFirst({
      where: { id: customerId, role: UserRole.CUSTOMER, deletedAt: null },
      select: { id: true, isActive: true },
    });
  },

  /**
   * 현재 활성 상태가 요청 값과 다를 때만 변경합니다.
   * 변경 건수 0은 이미 같은 상태이거나 다른 요청이 먼저 변경한 경우입니다.
   */
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
   * Prisma에서는 FOR UPDATE row lock을 직접 표현할 수 없어 raw SQL을 사용합니다.
   * 계정 정지 처리와 견적 전송·고객 직접 취소가 같은 견적 요청을 동시에 변경하지 않도록 대상 행을 잠급니다.
   */
  async lockCancelableRequestsForSuspension(
    customerId: string,
    db: Prisma.TransactionClient,
  ): Promise<number[]> {
    const rows = await db.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        SELECT id
        FROM estimate_requests
        WHERE "customerId" = ${customerId}::uuid
          AND "isActive" = true
          AND status IN (${cancelableEstimateRequestStatusSql})
        FOR UPDATE
      `,
    );

    return rows.map((row) => row.id);
  },

  /**
   * 잠근 견적 요청의 취소 전 상태와 후속 처리에 필요한 관계 데이터를 조회합니다.
   * 견적 기사·지정 기사·채팅방 정보는 이후 알림, 시스템 메시지, 이력 생성에 사용됩니다.
   */
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

  /**
   * 취소된 견적 요청에 속한 전송 완료(SENT) 견적을 취소합니다.
   * 확정된 견적은 이 경로에서 변경하지 않습니다.
   */
  cancelSentEstimates(requestIds: number[], canceledAt: Date, db: DbClient = prisma) {
    return db.estimate.updateMany({
      where: { estimateRequestId: { in: requestIds }, status: EstimateStatus.SENT },
      data: { status: EstimateStatus.CANCELED, canceledAt },
    });
  },

  /**
   * 취소된 견적 요청에 연결된 대기 중(PENDING) 견적 수정 요청을 취소합니다.
   */
  cancelPendingEstimateRevisions(requestIds: number[], db: DbClient = prisma) {
    return db.estimateRevision.updateMany({
      where: {
        status: EstimateRevisionStatus.PENDING,
        estimate: { estimateRequestId: { in: requestIds } },
      },
      data: { status: EstimateRevisionStatus.CANCELED },
    });
  },

  /**
   * PENDING·OPEN 상태인 활성 견적 요청만 취소하고, 실제 변경된 요청 ID를 반환합니다.
   * 후속 이력·알림 생성을 위해 raw SQL의 RETURNING을 사용해 실제로 수정한 행의 ID를 받습니다.
   */
  cancelPendingOrOpenEstimateRequests(
    requestIds: number[],
    canceledAt: Date,
    db: DbClient = prisma,
  ) {
    return db.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        UPDATE estimate_requests
        SET status = ${EstimateRequestStatus.CANCELED}::"EstimateRequestStatus",
            "isActive" = false,
            "canceledAt" = ${canceledAt}
        WHERE id IN (${Prisma.join(requestIds)})
          AND status IN (${cancelableEstimateRequestStatusSql})
          AND "isActive" = true
        RETURNING id
      `,
    );
  },

  /** 고객 정지로 취소된 견적 요청의 상태 변경 이력을 일괄 저장합니다. */
  createEstimateRequestHistories(
    data: Prisma.EstimateRequestHistoryCreateManyInput[],
    db: DbClient = prisma,
  ) {
    return db.estimateRequestHistory.createMany({ data });
  },

  /** 취소된 견적 요청과 연결된 채팅방에 시스템 안내 메시지를 일괄 저장합니다. */
  createSystemMessages(data: Prisma.ChatMessageCreateManyInput[], db: DbClient = prisma) {
    return db.chatMessage.createMany({ data });
  },

  /** 취소된 견적 요청과 연결된 채팅방들의lastMessageAt을 정지 처리 시각으로 일괄 갱신합니다. */
  updateChatRoomsLastMessageAt(roomIds: number[], lastMessageAt: Date, db: DbClient = prisma) {
    return db.chatRoom.updateMany({
      where: {
        id: { in: roomIds },
        OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: lastMessageAt } }],
      },
      data: { lastMessageAt },
    });
  },

  /** 견적 기사·지정 기사에게 보낼 취소 알림을 중복 키는 건너뛰며 일괄 저장합니다. */
  createNotifications(data: Prisma.NotificationCreateManyInput[], db: DbClient = prisma) {
    return db.notification.createManyAndReturn({
      data,
      skipDuplicates: true,
      select: {
        userId: true,
        id: true,
        type: true,
        title: true,
        content: true,
        linkUrl: true,
        isRead: true,
        readAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  },

  /**
   * 정지 또는 해제 처리의 도메인 이력을 UserSuspension에 저장합니다.
   * RELEASE도 남겨 상태 변경 주체·사유·시점을 추적합니다.
   */
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

  /**
   * 관리자 운영 감사 로그를 ActivityLog에 저장합니다.
   * UserSuspension의 회원 상태 이력과 별도로, 관리자의 행위를 검색·감사하는 용도입니다.
   */
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
