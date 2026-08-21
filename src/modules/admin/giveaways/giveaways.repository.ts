import { LogAction, LogTargetType, Prisma, ReportTargetType, UserRole } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

import {
  ADMIN_GIVEAWAY_SORT_RULES,
  REPORT_HIGH_TIE_BREAK,
  type AdminGiveawaySort,
  type GiveawaySortClause,
  type GiveawaySortField,
} from "./giveaways.constants";

/**
 * 목록 조회에 필요한 필드만 select.
 * author / region 은 list item DTO 매핑용.
 */
const adminGiveawaySelect = {
  id: true,
  authorId: true,
  regionId: true,
  title: true,
  description: true,
  status: true,
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
} satisfies Prisma.GiveawaySelect;

export type AdminGiveawayRow = Prisma.GiveawayGetPayload<{
  select: typeof adminGiveawaySelect;
}>;

export type AdminGiveawayListFilters = {
  isHidden?: boolean;
  keyword?: string;
};

type FindManyParams = {
  skip: number;
  take: number;
  filters: AdminGiveawayListFilters;
  sort: AdminGiveawaySort;
};

const PRISMA_SORT_FIELD: Record<GiveawaySortField, keyof Prisma.GiveawayOrderByWithRelationInput> =
  {
    createdAt: "createdAt",
    id: "id",
  };

const SQL_SORT_FIELD: Record<GiveawaySortField, Prisma.Sql> = {
  createdAt: Prisma.sql`g.created_at`,
  id: Prisma.sql`g.id`,
};

function clausesToPrismaOrderBy(
  clauses: readonly GiveawaySortClause[],
): Prisma.GiveawayOrderByWithRelationInput[] {
  return clauses.map((clause) => ({
    [PRISMA_SORT_FIELD[clause.field]]: clause.dir,
  }));
}

function clausesToSqlOrderBy(clauses: readonly GiveawaySortClause[]): Prisma.Sql {
  return Prisma.join(
    clauses.map((clause) => {
      const column = SQL_SORT_FIELD[clause.field];
      return clause.dir === "asc" ? Prisma.sql`${column} ASC` : Prisma.sql`${column} DESC`;
    }),
    ", ",
  );
}

function toPrismaWhere(filters: AdminGiveawayListFilters): Prisma.GiveawayWhereInput {
  const where: Prisma.GiveawayWhereInput = {};

  if (filters.isHidden !== undefined) {
    where.isHidden = filters.isHidden;
  }

  if (filters.keyword) {
    where.OR = [
      { title: { contains: filters.keyword, mode: "insensitive" } },
      { description: { contains: filters.keyword, mode: "insensitive" } },
      { author: { name: { contains: filters.keyword, mode: "insensitive" } } },
    ];
  }

  return where;
}

function toPrismaOrderBy(sort: AdminGiveawaySort): Prisma.GiveawayOrderByWithRelationInput[] {
  if (sort === "REPORT_HIGH") {
    return clausesToPrismaOrderBy(REPORT_HIGH_TIE_BREAK);
  }

  return clausesToPrismaOrderBy(ADMIN_GIVEAWAY_SORT_RULES[sort]);
}

/** ILIKE 와일드카드(%, _)와 escape 문자(\)를 리터럴로 검색하기 위해 이스케이프합니다. */
function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildKeywordIlikeSql(keyword: string): Prisma.Sql {
  const pattern = `%${escapeIlikePattern(keyword)}%`;
  return Prisma.sql`(
    g.title ILIKE ${pattern} ESCAPE '\\'
    OR g.description ILIKE ${pattern} ESCAPE '\\'
    OR u.name ILIKE ${pattern} ESCAPE '\\'
  )`;
}

function buildFilterWhereParts(filters: AdminGiveawayListFilters): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [];

  if (filters.isHidden !== undefined) {
    parts.push(Prisma.sql`g.is_hidden = ${filters.isHidden}`);
  }
  if (filters.keyword) {
    parts.push(buildKeywordIlikeSql(filters.keyword));
  }

  return parts;
}

function buildRawWhereSql(filters: AdminGiveawayListFilters): Prisma.Sql {
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
    WHERE rp.target_type = CAST(${ReportTargetType.GIVEAWAY} AS "ReportTargetType")
      AND rp.target_id = CAST(g.id AS TEXT)
  ) DESC, ${clausesToSqlOrderBy(REPORT_HIGH_TIE_BREAK)}`;
}

/**
 * 신고 건수 정렬이 필요할 때 raw SQL 로 조회합니다.
 * Prisma orderBy 로는 report count 정렬이 불가합니다.
 */
async function findGiveawaysByRawSql(params: {
  skip: number;
  take: number;
  filters: AdminGiveawayListFilters;
}): Promise<{ giveaways: AdminGiveawayRow[]; totalCount: number }> {
  const { skip, take, filters } = params;
  const whereSql = buildRawWhereSql(filters);
  const orderSql = buildReportHighOrderBySql();
  const fromSql = filters.keyword
    ? Prisma.sql`FROM giveaways AS g INNER JOIN "User" AS u ON u.id = g.author_id`
    : Prisma.sql`FROM giveaways AS g`;

  const [idRows, countRows] = await Promise.all([
    prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT g.id
      ${fromSql}
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${take} OFFSET ${skip}
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      ${fromSql}
      WHERE ${whereSql}
    `),
  ]);

  const totalCount = Number(countRows[0]?.count ?? 0);
  const ids = idRows.map((row) => row.id);

  if (ids.length === 0) {
    return { giveaways: [], totalCount };
  }

  const giveaways = await prisma.giveaway.findMany({
    where: { id: { in: ids } },
    select: adminGiveawaySelect,
  });

  const giveawayById = new Map(giveaways.map((giveaway) => [giveaway.id, giveaway]));
  const orderedGiveaways = ids
    .map((id) => giveawayById.get(id))
    .filter((giveaway): giveaway is AdminGiveawayRow => giveaway !== undefined);

  return { giveaways: orderedGiveaways, totalCount };
}

export const giveawaysRepository = {
  findGiveawaysWithCount({ skip, take, filters, sort }: FindManyParams, db: DbClient = prisma) {
    if (sort === "REPORT_HIGH") {
      return findGiveawaysByRawSql({ skip, take, filters });
    }

    const where = toPrismaWhere(filters);
    const orderBy = toPrismaOrderBy(sort);

    return Promise.all([
      db.giveaway.findMany({
        where,
        skip,
        take,
        orderBy,
        select: adminGiveawaySelect,
      }),
      db.giveaway.count({ where }),
    ]).then(([giveaways, totalCount]) => ({ giveaways, totalCount }));
  },

  findGiveawayById(giveawayId: number, db: DbClient = prisma) {
    return db.giveaway.findUnique({
      where: { id: giveawayId },
      select: adminGiveawaySelect,
    });
  },

  /**
   * 현재 isHidden 이 expectedHidden 일 때만 전환합니다.
   * 동시 요청에서 중복 로그/알림을 막기 위한 조건부 업데이트입니다.
   * 전환에 실패하면 null 을 반환합니다.
   */
  async updateGiveawayHiddenIf(
    giveawayId: number,
    expectedHidden: boolean,
    nextHidden: boolean,
    db: DbClient = prisma,
  ): Promise<AdminGiveawayRow | null> {
    const result = await db.giveaway.updateMany({
      where: {
        id: giveawayId,
        isHidden: expectedHidden,
      },
      data: { isHidden: nextHidden },
    });

    if (result.count === 0) {
      return null;
    }

    return db.giveaway.findUnique({
      where: { id: giveawayId },
      select: adminGiveawaySelect,
    });
  },

  countReportsByTargetIds(targetIds: string[], db: DbClient = prisma) {
    if (targetIds.length === 0) {
      return Promise.resolve([] as Array<{ targetId: string; _count: { _all: number } }>);
    }

    return db.report.groupBy({
      by: ["targetId"],
      where: {
        targetType: ReportTargetType.GIVEAWAY,
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
        targetType: LogTargetType.GIVEAWAY,
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
        targetType: LogTargetType.GIVEAWAY,
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
