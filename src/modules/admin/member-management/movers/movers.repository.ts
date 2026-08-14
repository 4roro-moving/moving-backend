import {
  EstimateRequestStatus,
  EstimateStatus,
  Prisma,
  ReportTargetType,
  UserRole,
} from "@prisma/client";
import type { MoveType } from "@prisma/client";
import type { DbClient } from "../../../../utils/transaction";
import { prisma } from "../../../../lib/prisma";
import { kstDayEnd, kstDayStart, parseDateMarker } from "../../../../utils/kst";
import type { MemberReceivedReportCounts } from "../member.type";
import type { ListMoverQuery } from "./movers.type";

/** 기사 상세 응답에서 각 이력 항목별로 제공하는 기본 최신 건수입니다. */
export const MOVER_HISTORY_LIMIT = 5;

const moverDetailSelect = {
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
  moverProfile: {
    select: {
      nickname: true,
      imageUrl: true,
      career: true,
      shortIntro: true,
      description: true,
      averageRating: true,
      reviewCount: true,
      confirmedCount: true,
      serviceAreas: {
        select: { region: { select: { name: true } } },
        orderBy: { regionId: "asc" },
      },
      serviceTypes: {
        select: { moveType: true },
        orderBy: { id: "asc" },
      },
    },
  },
} satisfies Prisma.UserSelect;

const inProgressEstimateSelect = {
  id: true,
  estimateRequestId: true,
  status: true,
  price: true,
  createdAt: true,
  estimateRequest: {
    select: {
      moveDate: true,
      status: true,
      isActive: true,
      confirmedEstimateId: true,
    },
  },
} satisfies Prisma.EstimateSelect;

const recentEstimateSelect = {
  id: true,
  status: true,
  price: true,
  confirmedAt: true,
  estimateRequest: { select: { status: true } },
} satisfies Prisma.EstimateSelect;

const reviewHistorySelect = {
  id: true,
  customerId: true,
  rating: true,
  content: true,
  isHidden: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;

const reportHistorySelect = {
  id: true,
  reason: true,
  status: true,
  createdAt: true,
} satisfies Prisma.ReportSelect;

type MoverListMemberFields = MemberReceivedReportCounts & {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  isProfileCompleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
};

export type MoverListRow = MoverListMemberFields & {
  nickname: string | null;
  career: number;
  averageRating: Prisma.Decimal;
  reviewCount: number;
  confirmedCount: number;
  serviceAreas: string[];
  serviceTypes: MoveType[];
};

export type MoverDetailRow = Prisma.UserGetPayload<{ select: typeof moverDetailSelect }>;
export type InProgressEstimateRow = Prisma.EstimateGetPayload<{
  select: typeof inProgressEstimateSelect;
}>;
export type RecentEstimateRow = Prisma.EstimateGetPayload<{ select: typeof recentEstimateSelect }>;
export type MoverReviewHistoryRow = Prisma.ReviewGetPayload<{ select: typeof reviewHistorySelect }>;
export type MoverReportHistoryRow = Prisma.ReportGetPayload<{ select: typeof reportHistorySelect }>;

type ListParams = {
  skip: number;
  take: number;
  sorts: string[];
  filters: ListMoverQuery;
};

type HistoryParams = {
  moverId: string;
  take?: number;
};

/** raw SQL 쿼리 전용 응답 DTO 타입 */
type MoverListRawRow = MoverListMemberFields & {
  nickname: string | null;
  career: number | null;
  averageRating: Prisma.Decimal | null;
  reviewCount: number | null;
  confirmedCount: number | null;
  serviceAreas: string[];
  serviceTypes: MoveType[];
  totalCount: bigint;
};

/**
 * `sorts` 파라미터로 받은 정렬 기준들을 순서대로 SQL ORDER BY 절로 변환합니다.
 *
 * `CREATED_AT_DESC` 또는 `CREATED_AT_ASC`가 없는 경우,
 * `createdAt DESC`, `id ASC`를 보조 정렬로 붙여 페이지 순서를 고정합니다.
 */
function buildMoverReportOrderBy(sorts: string[]): Prisma.Sql {
  const columns: Record<string, Prisma.Sql> = {
    PENDING_DESC: Prisma.sql`"pendingReceivedReportCount" DESC`,
    PENDING_ASC: Prisma.sql`"pendingReceivedReportCount" ASC`,
    CONFIRMED_DESC: Prisma.sql`COALESCE(mp."confirmedCount", 0) DESC`,
    CONFIRMED_ASC: Prisma.sql`COALESCE(mp."confirmedCount", 0) ASC`,
    RATING_DESC: Prisma.sql`COALESCE(mp."averageRating", 0) DESC`,
    RATING_ASC: Prisma.sql`COALESCE(mp."averageRating", 0) ASC`,
    CAREER_DESC: Prisma.sql`COALESCE(mp.career, 0) DESC`,
    CAREER_ASC: Prisma.sql`COALESCE(mp.career, 0) ASC`,
    CREATED_AT_DESC: Prisma.sql`u."createdAt" DESC`,
    CREATED_AT_ASC: Prisma.sql`u."createdAt" ASC`,
  };

  const orderBy = sorts.flatMap((sort) => (columns[sort] ? [columns[sort]] : []));

  if (!sorts.some((sort) => sort.startsWith("CREATED_AT_"))) {
    orderBy.push(Prisma.sql`u."createdAt" DESC`);
  }
  orderBy.push(Prisma.sql`u.id ASC`);

  return Prisma.join(orderBy, ", ");
}

/** 기사 목록의 요청받은 필터를 raw SQL WHERE 절로 만듭니다. */
function buildMoverListWhereSql(filters: ListMoverQuery): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`u.role = ${UserRole.MOVER}::"UserRole"`];

  if (filters.status === "ACTIVE") {
    conditions.push(Prisma.sql`u."deletedAt" IS NULL AND u."isActive" = TRUE`);
  } else if (filters.status === "SUSPENDED") {
    conditions.push(Prisma.sql`u."deletedAt" IS NULL AND u."isActive" = FALSE`);
  } else if (filters.status === "WITHDRAWN") {
    conditions.push(Prisma.sql`u."deletedAt" IS NOT NULL`);
  } else {
    conditions.push(Prisma.sql`u."deletedAt" IS NULL`);
  }

  if (filters.isProfileCompleted !== undefined) {
    conditions.push(Prisma.sql`u."isProfileCompleted" = ${filters.isProfileCompleted}`);
  }

  if (filters.keyword) {
    const pattern = `%${filters.keyword}%`;
    conditions.push(Prisma.sql`(
      u.name ILIKE ${pattern}
      OR u.email ILIKE ${pattern}
      OR EXISTS (
        SELECT 1 FROM mover_profiles AS mp_keyword
        WHERE mp_keyword."userId" = u.id AND mp_keyword.nickname ILIKE ${pattern}
      )
    )`);
  }

  if (filters.regionId !== undefined || filters.moveType !== undefined) {
    const profileConditions: Prisma.Sql[] = [Prisma.sql`mp_filter."userId" = u.id`];
    if (filters.regionId !== undefined) {
      profileConditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM mover_service_areas AS msa
        WHERE msa."moverProfileId" = mp_filter.id AND msa."regionId" = ${filters.regionId}
      )`);
    }
    if (filters.moveType !== undefined) {
      profileConditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM mover_service_types AS mst
        WHERE mst."moverProfileId" = mp_filter.id AND mst."moveType" = ${filters.moveType}::"MoveType"
      )`);
    }
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM mover_profiles AS mp_filter
      WHERE ${Prisma.join(profileConditions, " AND ")}
    )`);
  }

  if (filters.fromDate) {
    const marker = parseDateMarker(filters.fromDate);
    if (!marker) throw new Error("Validated mover-list fromDate could not be parsed.");
    conditions.push(Prisma.sql`u."createdAt" >= ${kstDayStart(marker)}`);
  }
  if (filters.toDate) {
    const marker = parseDateMarker(filters.toDate);
    if (!marker) throw new Error("Validated mover-list toDate could not be parsed.");
    conditions.push(Prisma.sql`u."createdAt" <= ${kstDayEnd(marker)}`);
  }

  return Prisma.join(conditions, " AND ");
}

export const moversRepository = {
  /** 기사 목록과 피신고 건수를 함께 조회합니다. */
  async findManyWithCount({ skip, take, sorts, filters }: ListParams, db: DbClient = prisma) {
    const whereSql = buildMoverListWhereSql(filters);

    /**
     * 필터·신고 집계·다중 정렬을 적용한 전체 결과에서 LIMIT/OFFSET을 적용해 현재 페이지 행만 조회합니다.
     * 기사 프로필과 서비스 지역·유형도 함께 조회해 Prisma로 프로필·지역·유형을 각각 다시 조회하는 쿼리를 줄입니다.
     */
    const rows = await db.$queryRaw<MoverListRawRow[]>(Prisma.sql`
        SELECT
          u.id,
          u.email,
          u.name,
          u.phone,
          u."isActive",
          u."isProfileCompleted",
          u."deletedAt",
          u."createdAt",
          mp.nickname,
          mp.career,
          mp."averageRating",
          mp."reviewCount",
          mp."confirmedCount",
          COALESCE((
            SELECT jsonb_agg(r.name ORDER BY msa."regionId")
            FROM mover_service_areas AS msa
            INNER JOIN regions AS r ON r.id = msa."regionId"
            WHERE msa."moverProfileId" = mp.id
          ), '[]'::jsonb) AS "serviceAreas",
          COALESCE((
            SELECT jsonb_agg(mst."moveType" ORDER BY mst.id)
            FROM mover_service_types AS mst
            WHERE mst."moverProfileId" = mp.id
          ), '[]'::jsonb) AS "serviceTypes",
          COUNT(rp.id)::int AS "receivedReportCount",
          COUNT(rp.id) FILTER (WHERE rp.status = ${"PENDING"}::"ReportStatus")::int
            AS "pendingReceivedReportCount",
          COUNT(*) OVER()::bigint AS "totalCount"
        FROM "User" AS u
        LEFT JOIN mover_profiles AS mp ON mp."userId" = u.id
        LEFT JOIN reports AS rp
          ON rp.target_type = ${ReportTargetType.MOVER}::"ReportTargetType"
          AND rp.target_id = u.id::text
        WHERE ${whereSql}
        GROUP BY
          u.id,
          u.email,
          u.name,
          u.phone,
          u."isActive",
          u."isProfileCompleted",
          u."deletedAt",
          u."createdAt",
          mp.id,
          mp.nickname,
          mp.career,
          mp."averageRating",
          mp."reviewCount",
          mp."confirmedCount"
        ORDER BY ${buildMoverReportOrderBy(sorts)}
        LIMIT ${take} OFFSET ${skip}
    `);

    const firstRow = rows[0];
    const countRows = firstRow
      ? undefined
      : await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM "User" AS u
          WHERE ${whereSql}
        `);
    // 페이지 범위를 벗어나 행이 없을 때만 같은 raw SQL 필터로 count를 다시 조회
    const totalCount = firstRow ? Number(firstRow.totalCount) : Number(countRows?.[0]?.count ?? 0);

    const movers = rows.map(({ totalCount: _totalCount, ...row }) => ({
      ...row,
      career: row.career ?? 0,
      averageRating: row.averageRating ?? new Prisma.Decimal(0),
      reviewCount: row.reviewCount ?? 0,
      confirmedCount: row.confirmedCount ?? 0,
    })) satisfies MoverListRow[];

    return {
      movers,
      totalCount,
    };
  },

  /** ID와 MOVER 역할이 일치하는 기사 상세를 조회합니다. 탈퇴 기사도 조회 대상입니다. */
  findMoverById(moverId: string, db: DbClient = prisma) {
    return db.user.findFirst({
      where: { id: moverId, role: UserRole.MOVER },
      select: moverDetailSelect,
    });
  },

  /** 아직 거래가 종료되지 않은 전송·확정 견적의 최신 일부와 전체 건수를 조회합니다. */
  async findInProgressEstimateHistory(
    { moverId, take = MOVER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    const where: Prisma.EstimateWhereInput = {
      moverId,
      OR: [
        {
          status: EstimateStatus.SENT,
          estimateRequest: {
            status: EstimateRequestStatus.OPEN,
            isActive: true,
          },
        },
        {
          status: EstimateStatus.CONFIRMED,
          estimateRequest: {
            status: EstimateRequestStatus.CONFIRMED,
            isActive: true,
          },
        },
      ],
    };

    const [items, totalCount] = await Promise.all([
      db.estimate.findMany({
        where,
        select: inProgressEstimateSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take,
      }),
      db.estimate.count({ where }),
    ]);

    return { items, totalCount };
  },

  /** 만료·취소되었거나 이사가 완료된 최근 견적 이력의 최신 일부와 전체 건수를 조회합니다. */
  async findRecentEstimateHistory(
    { moverId, take = MOVER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    const where: Prisma.EstimateWhereInput = {
      moverId,
      OR: [
        { status: { in: [EstimateStatus.EXPIRED, EstimateStatus.CANCELED] } },
        { estimateRequest: { status: EstimateRequestStatus.COMPLETED } },
      ],
    };

    const [items, totalCount] = await Promise.all([
      db.estimate.findMany({
        where,
        select: recentEstimateSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take,
      }),
      db.estimate.count({ where }),
    ]);

    return { items, totalCount };
  },

  /** 기사가 받은 리뷰의 최신 일부와 전체 건수를 조회합니다. */
  async findReviewHistory(
    { moverId, take = MOVER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    const where: Prisma.ReviewWhereInput = { moverId };

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

  /** 기사를 직접 대상으로 접수된 신고의 최신 일부와 전체 건수를 조회합니다. */
  async findReceivedReportHistory(
    { moverId, take = MOVER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    const where: Prisma.ReportWhereInput = {
      targetType: ReportTargetType.MOVER,
      targetId: moverId,
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
};
