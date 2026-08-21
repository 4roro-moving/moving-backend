import { LogAction, LogTargetType, Prisma, ReportTargetType, UserRole } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

import {
  ADMIN_RESIDENCE_REVIEW_SORT_RULES,
  REPORT_HIGH_TIE_BREAK,
  type AdminResidenceReviewSort,
  type ResidenceReviewSortClause,
  type ResidenceReviewSortField,
} from "./residence-reviews.constants";

/**
 * 목록 조회에 필요한 필드만 select.
 * author / region 은 list item DTO 매핑용.
 */
const adminResidenceReviewSelect = {
  id: true,
  authorId: true,
  regionId: true,
  title: true,
  content: true,
  rating: true,
  isHidden: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  region: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ResidenceReviewSelect;

export type AdminResidenceReviewRow = Prisma.ResidenceReviewGetPayload<{
  select: typeof adminResidenceReviewSelect;
}>;

export type AdminResidenceReviewListFilters = {
  isHidden?: boolean;
  keyword?: string;
};

type FindManyParams = {
  skip: number;
  take: number;
  filters: AdminResidenceReviewListFilters;
  sort: AdminResidenceReviewSort;
};

const PRISMA_SORT_FIELD: Record<
  ResidenceReviewSortField,
  keyof Prisma.ResidenceReviewOrderByWithRelationInput
> = {
  createdAt: "createdAt",
  id: "id",
  rating: "rating",
};

const SQL_SORT_FIELD: Record<ResidenceReviewSortField, Prisma.Sql> = {
  createdAt: Prisma.sql`rr.created_at`,
  id: Prisma.sql`rr.id`,
  rating: Prisma.sql`rr.rating`,
};

function clausesToPrismaOrderBy(
  clauses: readonly ResidenceReviewSortClause[],
): Prisma.ResidenceReviewOrderByWithRelationInput[] {
  return clauses.map((clause) => ({
    [PRISMA_SORT_FIELD[clause.field]]: clause.dir,
  }));
}

function clausesToSqlOrderBy(clauses: readonly ResidenceReviewSortClause[]): Prisma.Sql {
  return Prisma.join(
    clauses.map((clause) => {
      const column = SQL_SORT_FIELD[clause.field];
      return clause.dir === "asc" ? Prisma.sql`${column} ASC` : Prisma.sql`${column} DESC`;
    }),
    ", ",
  );
}

function toPrismaWhere(filters: AdminResidenceReviewListFilters): Prisma.ResidenceReviewWhereInput {
  const where: Prisma.ResidenceReviewWhereInput = {};

  if (filters.isHidden !== undefined) {
    where.isHidden = filters.isHidden;
  }

  if (filters.keyword) {
    where.OR = [
      { title: { contains: filters.keyword, mode: "insensitive" } },
      { content: { contains: filters.keyword, mode: "insensitive" } },
      { author: { name: { contains: filters.keyword, mode: "insensitive" } } },
    ];
  }

  return where;
}

function toPrismaOrderBy(
  sort: AdminResidenceReviewSort,
): Prisma.ResidenceReviewOrderByWithRelationInput[] {
  if (sort === "REPORT_HIGH") {
    return clausesToPrismaOrderBy(REPORT_HIGH_TIE_BREAK);
  }

  return clausesToPrismaOrderBy(ADMIN_RESIDENCE_REVIEW_SORT_RULES[sort]);
}

/** ILIKE 와일드카드(%, _)와 escape 문자(\)를 리터럴로 검색하기 위해 이스케이프합니다. */
function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildKeywordIlikeSql(keyword: string): Prisma.Sql {
  const pattern = `%${escapeIlikePattern(keyword)}%`;
  return Prisma.sql`(
    rr.title ILIKE ${pattern} ESCAPE '\\'
    OR rr.content ILIKE ${pattern} ESCAPE '\\'
    OR u.name ILIKE ${pattern} ESCAPE '\\'
  )`;
}

function buildFilterWhereParts(filters: AdminResidenceReviewListFilters): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [];

  if (filters.isHidden !== undefined) {
    parts.push(Prisma.sql`rr.is_hidden = ${filters.isHidden}`);
  }
  if (filters.keyword) {
    parts.push(buildKeywordIlikeSql(filters.keyword));
  }

  return parts;
}

function buildRawWhereSql(filters: AdminResidenceReviewListFilters): Prisma.Sql {
  const parts = buildFilterWhereParts(filters);

  if (parts.length === 0) {
    return Prisma.sql`TRUE`;
  }

  return Prisma.join(parts, " AND ");
}

function buildReportHighOrderBySql(): Prisma.Sql {
  return Prisma.sql`(
    SELECT COUNT(*)::int
    FROM reports AS rp
    WHERE rp.target_type = CAST(${ReportTargetType.RESIDENCE_REVIEW} AS "ReportTargetType")
      AND rp.target_id = CAST(rr.id AS TEXT)
  ) DESC, ${clausesToSqlOrderBy(REPORT_HIGH_TIE_BREAK)}`;
}

/**
 * 신고 건수 정렬이 필요할 때 raw SQL 로 조회합니다.
 * Prisma orderBy 로는 report count 정렬이 불가합니다.
 */
async function findResidenceReviewsByRawSql(
  params: {
    skip: number;
    take: number;
    filters: AdminResidenceReviewListFilters;
  },
  db: DbClient,
): Promise<{ reviews: AdminResidenceReviewRow[]; totalCount: number }> {
  const { skip, take, filters } = params;
  const whereSql = buildRawWhereSql(filters);
  const orderSql = buildReportHighOrderBySql();
  const fromSql = filters.keyword
    ? Prisma.sql`FROM residence_reviews AS rr INNER JOIN "User" AS u ON u.id = rr.author_id`
    : Prisma.sql`FROM residence_reviews AS rr`;

  const [idRows, countRows] = await Promise.all([
    db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT rr.id
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

  const reviews = await db.residenceReview.findMany({
    where: { id: { in: ids } },
    select: adminResidenceReviewSelect,
  });

  const reviewById = new Map(reviews.map((review) => [review.id, review]));
  const orderedReviews = ids
    .map((id) => reviewById.get(id))
    .filter((review): review is AdminResidenceReviewRow => review !== undefined);

  return { reviews: orderedReviews, totalCount };
}

export const residenceReviewsRepository = {
  findResidenceReviewsWithCount(
    { skip, take, filters, sort }: FindManyParams,
    db: DbClient = prisma,
  ) {
    if (sort === "REPORT_HIGH") {
      return findResidenceReviewsByRawSql({ skip, take, filters }, db);
    }

    const where = toPrismaWhere(filters);
    const orderBy = toPrismaOrderBy(sort);

    return Promise.all([
      db.residenceReview.findMany({
        where,
        skip,
        take,
        orderBy,
        select: adminResidenceReviewSelect,
      }),
      db.residenceReview.count({ where }),
    ]).then(([reviews, totalCount]) => ({ reviews, totalCount }));
  },

  findResidenceReviewById(residenceReviewId: number, db: DbClient = prisma) {
    return db.residenceReview.findUnique({
      where: { id: residenceReviewId },
      select: adminResidenceReviewSelect,
    });
  },

  /**
   * 현재 isHidden 이 expectedHidden 일 때만 전환합니다.
   * 동시 요청에서 중복 로그/알림을 막기 위한 조건부 업데이트입니다.
   * 전환에 실패하면 null 을 반환합니다.
   */
  async updateResidenceReviewHiddenIf(
    residenceReviewId: number,
    expectedHidden: boolean,
    nextHidden: boolean,
    db: DbClient = prisma,
  ): Promise<AdminResidenceReviewRow | null> {
    const result = await db.residenceReview.updateMany({
      where: {
        id: residenceReviewId,
        isHidden: expectedHidden,
      },
      data: { isHidden: nextHidden },
    });

    if (result.count === 0) {
      return null;
    }

    return db.residenceReview.findUnique({
      where: { id: residenceReviewId },
      select: adminResidenceReviewSelect,
    });
  },

  countReportsByTargetIds(targetIds: string[], db: DbClient = prisma) {
    if (targetIds.length === 0) {
      return Promise.resolve([] as Array<{ targetId: string; _count: { _all: number } }>);
    }

    return db.report.groupBy({
      by: ["targetId"],
      where: {
        targetType: ReportTargetType.RESIDENCE_REVIEW,
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
        targetType: LogTargetType.RESIDENCE_REVIEW,
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
        targetType: LogTargetType.RESIDENCE_REVIEW,
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
