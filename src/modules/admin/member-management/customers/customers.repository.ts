import {
  EstimateRequestStatus,
  EstimateRevisionStatus,
  EstimateStatus,
  LogAction,
  LogTargetType,
  Prisma,
  ReportTargetType,
  UserRole,
} from "@prisma/client";
import type { SuspensionAction } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import type { DbClient } from "../../../../utils/transaction";

export const CUSTOMER_HISTORY_LIMIT = 5;

/** 고객 정지 시 함께 취소하는 견적 요청 상태입니다. ORM과 raw SQL에서 함께 사용합니다. */
export const CANCELABLE_ESTIMATE_REQUEST_STATUSES: EstimateRequestStatus[] = [
  EstimateRequestStatus.PENDING,
  EstimateRequestStatus.OPEN,
];

/** 고객 목록 조회에 공통으로 사용하는 select */
const customerListSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  isActive: true,
  isProfileCompleted: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const customerDetailSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  authProvider: true,
  isActive: true,
  isProfileCompleted: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  customerProfile: {
    select: {
      imageUrl: true,
      serviceAreas: {
        select: {
          region: {
            select: { name: true },
          },
        },
        orderBy: { regionId: "asc" },
      },
      serviceTypes: {
        select: { moveType: true },
        orderBy: { id: "asc" },
      },
    },
  },
} satisfies Prisma.UserSelect;

const estimateHistorySelect = {
  id: true,
  moveType: true,
  status: true,
  moveDate: true,
  createdAt: true,
} satisfies Prisma.EstimateRequestSelect;

const reviewHistorySelect = {
  id: true,
  moverId: true,
  rating: true,
  content: true,
  isHidden: true,
  createdAt: true,
  mover: {
    select: {
      name: true,
      moverProfile: {
        select: { nickname: true },
      },
    },
  },
} satisfies Prisma.ReviewSelect;

const reportHistorySelect = {
  id: true,
  targetType: true,
  targetId: true,
  reason: true,
  status: true,
  createdAt: true,
} satisfies Prisma.ReportSelect;

const suspensionHistorySelect = {
  id: true,
  action: true,
  reason: true,
  createdAt: true,
} satisfies Prisma.UserSuspensionSelect;

export type CustomerListRow = Prisma.UserGetPayload<{ select: typeof customerListSelect }>;
export type CustomerDetailRow = Prisma.UserGetPayload<{ select: typeof customerDetailSelect }>;
export type EstimateHistoryRow = Prisma.EstimateRequestGetPayload<{
  select: typeof estimateHistorySelect;
}>;
export type ReviewHistoryRow = Prisma.ReviewGetPayload<{ select: typeof reviewHistorySelect }>;
export type ReportHistoryRow = Prisma.ReportGetPayload<{ select: typeof reportHistorySelect }>;
export type SuspensionHistoryRow = Prisma.UserSuspensionGetPayload<{
  select: typeof suspensionHistorySelect;
}>;

type ListParams = {
  skip: number;
  take: number;
  where: Prisma.UserWhereInput;
};

type HistoryParams = {
  customerId: string;
  take?: number;
};

export const customersRepository = {
  async findManyWithCount({ skip, take, where }: ListParams, db: DbClient = prisma) {
    const [customers, totalCount] = await Promise.all([
      db.user.findMany({
        where,
        select: customerListSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      db.user.count({ where }),
    ]);

    return { customers, totalCount };
  },

  findCustomerById(customerId: string, db: DbClient = prisma) {
    return db.user.findFirst({
      where: {
        id: customerId,
        role: UserRole.CUSTOMER,
      },
      select: customerDetailSelect,
    });
  },

  async findEstimateHistory(
    { customerId, take = CUSTOMER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    const where: Prisma.EstimateRequestWhereInput = { customerId };

    const [items, totalCount] = await Promise.all([
      db.estimateRequest.findMany({
        where,
        select: estimateHistorySelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take,
      }),
      db.estimateRequest.count({ where }),
    ]);

    return { items, totalCount };
  },

  async findReviewHistory(
    { customerId, take = CUSTOMER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    const where: Prisma.ReviewWhereInput = { customerId };

    const [items, totalCount] = await Promise.all([
      db.review.findMany({
        where,
        select: reviewHistorySelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take,
      }),
      db.review.count({ where }),
    ]);

    return { items, totalCount };
  },

  async findFiledReportHistory(
    { customerId, take = CUSTOMER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    const where: Prisma.ReportWhereInput = { reporterId: customerId };

    const [items, totalCount] = await Promise.all([
      db.report.findMany({
        where,
        select: reportHistorySelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take,
      }),
      db.report.count({ where }),
    ]);

    return { items, totalCount };
  },

  /**
   * 고객이 작성한 리뷰가 신고된 내역(피신고)을 조회합니다.
   * Customer는 ReportTargetType 상 직접 신고 대상이 될 수 없습니다.
   */
  async findReceivedReportHistory(
    { customerId, take = CUSTOMER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    const reviewIds = await db.review.findMany({
      where: { customerId },
      select: { id: true },
    });

    if (reviewIds.length === 0) {
      return { items: [] as ReportHistoryRow[], totalCount: 0 };
    }

    const where: Prisma.ReportWhereInput = {
      targetType: ReportTargetType.REVIEW,
      targetId: { in: reviewIds.map((review) => String(review.id)) },
    };

    const [items, totalCount] = await Promise.all([
      db.report.findMany({
        where,
        select: reportHistorySelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take,
      }),
      db.report.count({ where }),
    ]);

    return { items, totalCount };
  },

  async findSuspensionHistory(
    { customerId, take = CUSTOMER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    const where: Prisma.UserSuspensionWhereInput = { userId: customerId };

    const [items, totalCount] = await Promise.all([
      db.userSuspension.findMany({
        where,
        select: suspensionHistorySelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take,
      }),
      db.userSuspension.count({ where }),
    ]);

    return { items, totalCount };
  },

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

  /** 고객 정지 시 취소 가능한 견적 요청(PENDING/OPEN)을 잠금 처리합니다. */
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
