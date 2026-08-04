import { LogAction, LogTargetType, ReportTargetType, UserRole, type Prisma } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

const adminReviewSelect = {
  id: true,
  customerId: true,
  moverId: true,
  estimateId: true,
  rating: true,
  content: true,
  isHidden: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  mover: {
    select: {
      id: true,
      name: true,
      moverProfile: {
        select: {
          nickname: true,
        },
      },
    },
  },
} satisfies Prisma.ReviewSelect;

export type AdminReviewRow = Prisma.ReviewGetPayload<{ select: typeof adminReviewSelect }>;

type FindManyParams = {
  skip: number;
  take: number;
  where: Prisma.ReviewWhereInput;
  orderBy: Prisma.ReviewOrderByWithRelationInput[];
};

export const contentsRepository = {
  findReviewsWithCount({ skip, take, where, orderBy }: FindManyParams, db: DbClient = prisma) {
    return Promise.all([
      db.review.findMany({
        where,
        skip,
        take,
        orderBy,
        select: adminReviewSelect,
      }),
      db.review.count({ where }),
    ]).then(([reviews, totalCount]) => ({ reviews, totalCount }));
  },

  findReviewById(reviewId: number, db: DbClient = prisma) {
    return db.review.findUnique({
      where: { id: reviewId },
      select: adminReviewSelect,
    });
  },

  updateReviewHidden(
    reviewId: number,
    isHidden: boolean,
    db: DbClient = prisma,
  ): Promise<AdminReviewRow> {
    return db.review.update({
      where: { id: reviewId },
      data: { isHidden },
      select: adminReviewSelect,
    });
  },

  countReportsByTargetIds(targetIds: string[], db: DbClient = prisma) {
    if (targetIds.length === 0) {
      return Promise.resolve([] as Array<{ targetId: string; _count: { _all: number } }>);
    }

    return db.report.groupBy({
      by: ["targetId"],
      where: {
        targetType: ReportTargetType.REVIEW,
        targetId: { in: targetIds },
      },
      _count: { _all: true },
    });
  },

  findModerationLogsByTargetIds(targetIds: string[], db: DbClient = prisma) {
    if (targetIds.length === 0) {
      return Promise.resolve([]);
    }

    return db.activityLog.findMany({
      where: {
        targetType: LogTargetType.REVIEW,
        targetId: { in: targetIds },
        action: { in: [LogAction.HIDE, LogAction.UNHIDE] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        memo: true,
        targetId: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },

  createActivityLog(
    input: {
      actorId: string;
      action: typeof LogAction.HIDE | typeof LogAction.UNHIDE;
      targetId: string;
      memo: string | null;
    },
    db: DbClient = prisma,
  ) {
    return db.activityLog.create({
      data: {
        actorId: input.actorId,
        actorRole: UserRole.ADMIN,
        action: input.action,
        targetType: LogTargetType.REVIEW,
        targetId: input.targetId,
        memo: input.memo,
      },
      select: {
        id: true,
        action: true,
        memo: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },
};
