import { LogAction, LogTargetType, Prisma, ReportTargetType, UserRole } from "@prisma/client";

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

export type AdminReviewListFilters = {
  isHidden?: boolean;
  keyword?: string;
  from?: Date;
  to?: Date;
};

export type AdminReviewSort = "LATEST" | "OLDEST" | "RATING_HIGH" | "RATING_LOW" | "REPORT_HIGH";

type FindManyParams = {
  skip: number;
  take: number;
  filters: AdminReviewListFilters;
  sort: AdminReviewSort;
  reportedOnly: boolean;
};

function toPrismaWhere(filters: AdminReviewListFilters): Prisma.ReviewWhereInput {
  const where: Prisma.ReviewWhereInput = {};

  if (filters.isHidden !== undefined) {
    where.isHidden = filters.isHidden;
  }

  if (filters.keyword) {
    where.OR = [
      { content: { contains: filters.keyword, mode: "insensitive" } },
      { customer: { name: { contains: filters.keyword, mode: "insensitive" } } },
    ];
  }

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) {
      where.createdAt.gte = filters.from;
    }
    if (filters.to) {
      where.createdAt.lte = filters.to;
    }
  }

  return where;
}

function toPrismaOrderBy(sort: AdminReviewSort): Prisma.ReviewOrderByWithRelationInput[] {
  switch (sort) {
    case "OLDEST":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "RATING_HIGH":
      return [{ rating: "desc" }, { createdAt: "desc" }, { id: "desc" }];
    case "RATING_LOW":
      return [{ rating: "asc" }, { createdAt: "desc" }, { id: "desc" }];
    case "REPORT_HIGH":
      // Prisma orderBy 로는 report count 정렬이 불가 — raw SQL 경로를 사용합니다.
      return [{ createdAt: "desc" }, { id: "desc" }];
    case "LATEST":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

/** ILIKE 와일드카드(%, _)와 escape 문자(\)를 리터럴로 검색하기 위해 이스케이프합니다. */
function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildKeywordIlikeSql(keyword: string): Prisma.Sql {
  const pattern = `%${escapeIlikePattern(keyword)}%`;
  return Prisma.sql`(r.content ILIKE ${pattern} ESCAPE '\\' OR c.name ILIKE ${pattern} ESCAPE '\\')`;
}

function buildReportedExistsWhereSql(filters: AdminReviewListFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`EXISTS (
      SELECT 1
      FROM reports AS rp
      WHERE rp.target_type = CAST(${ReportTargetType.REVIEW} AS "ReportTargetType")
        AND rp.target_id = CAST(r.id AS TEXT)
    )`,
  ];

  if (filters.isHidden !== undefined) {
    parts.push(Prisma.sql`r.is_hidden = ${filters.isHidden}`);
  }

  if (filters.keyword) {
    parts.push(buildKeywordIlikeSql(filters.keyword));
  }

  if (filters.from) {
    parts.push(Prisma.sql`r.created_at >= ${filters.from}`);
  }

  if (filters.to) {
    parts.push(Prisma.sql`r.created_at <= ${filters.to}`);
  }

  return Prisma.join(parts, " AND ");
}

function buildReportedOrderBySql(sort: AdminReviewSort): Prisma.Sql {
  switch (sort) {
    case "OLDEST":
      return Prisma.sql`r.created_at ASC, r.id ASC`;
    case "RATING_HIGH":
      return Prisma.sql`r.rating DESC, r.created_at DESC, r.id DESC`;
    case "RATING_LOW":
      return Prisma.sql`r.rating ASC, r.created_at DESC, r.id DESC`;
    case "REPORT_HIGH":
      return Prisma.sql`(
        SELECT COUNT(*)::int
        FROM reports AS rp
        WHERE rp.target_type = CAST(${ReportTargetType.REVIEW} AS "ReportTargetType")
          AND rp.target_id = CAST(r.id AS TEXT)
      ) DESC, r.created_at DESC, r.id DESC`;
    case "LATEST":
    default:
      return Prisma.sql`r.created_at DESC, r.id DESC`;
  }
}

/**
 * 신고 건수 정렬 또는 신고 존재 필터가 필요할 때 raw SQL 로 조회합니다.
 * Prisma orderBy 로는 report count 정렬이 불가합니다.
 */
async function findReviewsByRawSql(
  params: {
    skip: number;
    take: number;
    filters: AdminReviewListFilters;
    sort: AdminReviewSort;
    reportedOnly: boolean;
  },
  db: DbClient,
): Promise<{ reviews: AdminReviewRow[]; totalCount: number }> {
  const { skip, take, filters, sort, reportedOnly } = params;
  const whereSql = reportedOnly
    ? buildReportedExistsWhereSql(filters)
    : (() => {
        const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];

        if (filters.isHidden !== undefined) {
          parts.push(Prisma.sql`r.is_hidden = ${filters.isHidden}`);
        }
        if (filters.keyword) {
          parts.push(buildKeywordIlikeSql(filters.keyword));
        }
        if (filters.from) {
          parts.push(Prisma.sql`r.created_at >= ${filters.from}`);
        }
        if (filters.to) {
          parts.push(Prisma.sql`r.created_at <= ${filters.to}`);
        }

        return Prisma.join(parts, " AND ");
      })();
  const orderSql = buildReportedOrderBySql(sort);
  const fromSql = filters.keyword
    ? Prisma.sql`FROM reviews AS r INNER JOIN "User" AS c ON c.id = r.customer_id`
    : Prisma.sql`FROM reviews AS r`;

  const [idRows, countRows] = await Promise.all([
    db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT r.id
      ${fromSql}
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${take} OFFSET ${skip}
    `),
    db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      ${fromSql}
      WHERE ${whereSql}
    `),
  ]);

  const totalCount = Number(countRows[0]?.count ?? 0);
  const ids = idRows.map((row) => row.id);

  if (ids.length === 0) {
    return { reviews: [], totalCount };
  }

  const reviews = await db.review.findMany({
    where: { id: { in: ids } },
    select: adminReviewSelect,
  });

  const reviewById = new Map(reviews.map((review) => [review.id, review]));
  const orderedReviews = ids
    .map((id) => reviewById.get(id))
    .filter((review): review is AdminReviewRow => review !== undefined);

  return { reviews: orderedReviews, totalCount };
}

export const contentsRepository = {
  findReviewsWithCount(
    { skip, take, filters, sort, reportedOnly }: FindManyParams,
    db: DbClient = prisma,
  ) {
    if (reportedOnly || sort === "REPORT_HIGH") {
      return findReviewsByRawSql({ skip, take, filters, sort, reportedOnly }, db);
    }

    const where = toPrismaWhere(filters);
    const orderBy = toPrismaOrderBy(sort);

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

  /**
   * 현재 isHidden 이 expectedHidden 일 때만 전환합니다.
   * 동시 요청에서 중복 로그/알림을 막기 위한 조건부 업데이트입니다.
   * 전환에 실패하면 null 을 반환합니다.
   */
  async updateReviewHiddenIf(
    reviewId: number,
    expectedHidden: boolean,
    nextHidden: boolean,
    db: DbClient = prisma,
  ): Promise<AdminReviewRow | null> {
    const result = await db.review.updateMany({
      where: {
        id: reviewId,
        isHidden: expectedHidden,
      },
      data: { isHidden: nextHidden },
    });

    if (result.count === 0) {
      return null;
    }

    return db.review.findUnique({
      where: { id: reviewId },
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
