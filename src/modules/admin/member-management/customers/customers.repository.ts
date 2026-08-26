import { InquiryStatus, Prisma, ReportStatus, ReportTargetType, UserRole } from "@prisma/client";
import type { AuthProvider } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import { kstDayEnd, kstDayStart, parseDateMarker } from "../../../../utils/kst";
import type { DbClient } from "../../../../utils/transaction";
import type { MemberReceivedReportCounts } from "../member.type";
import { MEMBER_STATUS } from "../member-status.constants";
import type { ListCustomerQuery } from "./customers.type";

/** 고객 상세 응답에서 각 이력 항목별로 제공하는 기본 최신 건수입니다. */
export const CUSTOMER_HISTORY_LIMIT = 5;

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
  isActive: true,
  moveDate: true,
  expiresAt: true,
  expiredAt: true,
  canceledAt: true,
  completedAt: true,
  confirmedEstimateId: true,
  createdAt: true,
  // 취소된 요청은 처리 주체 역할을 조회해 고객 직접 취소와 관리자 조치를 구분합니다.
  histories: {
    where: { type: "CANCELED" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      changedByUser: {
        select: { role: true },
      },
    },
  },
  // 목록 화면에는 개별 견적을 노출하지 않고, 상태별 건수만 조합합니다.
  estimates: {
    select: { status: true },
  },
  // 확정/완료 거래에서만 존재하는 대표 견적입니다.
  confirmedEstimate: {
    select: {
      id: true,
      moverId: true,
      price: true,
      confirmedAt: true,
      mover: {
        select: {
          name: true,
          moverProfile: {
            select: { nickname: true },
          },
        },
      },
    },
  },
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

export type CustomerListRow = MemberReceivedReportCounts & {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  authProvider: AuthProvider;
  isActive: boolean;
  isProfileCompleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
};
export type CustomerDetailRow = Prisma.UserGetPayload<{ select: typeof customerDetailSelect }>;
export type EstimateHistoryRow = Prisma.EstimateRequestGetPayload<{
  select: typeof estimateHistorySelect;
}>;
export type ReviewHistoryRow = Prisma.ReviewGetPayload<{ select: typeof reviewHistorySelect }>;
export type ReportHistoryRow = Prisma.ReportGetPayload<{ select: typeof reportHistorySelect }>;

type ListParams = {
  skip: number;
  take: number;
  sorts: string[];
  filters: ListCustomerQuery;
};

type HistoryParams = {
  customerId: string;
  take?: number;
};

/** raw SQL 쿼리 전용 응답 DTO 타입 */
type CustomerListRawRow = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  authProvider: AuthProvider;
  isActive: boolean;
  isProfileCompleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  receivedReportCount: number;
  pendingReceivedReportCount: number;
  openInquiryCount: number;
  totalCount: bigint;
};

/** 기본 정렬(가입일) 목록의 페이지 선조회 결과입니다. 집계값은 별도 쿼리에서 페이지 대상만 계산합니다. */
type CustomerListPageRow = Omit<
  CustomerListRawRow,
  "receivedReportCount" | "pendingReceivedReportCount" | "openInquiryCount" | "totalCount"
>;

type OpenInquiryCountRow = {
  customerId: string;
  openInquiryCount: number;
};

type ReceivedReportCountRow = {
  customerId: string;
  receivedReportCount: number;
  pendingReceivedReportCount: number;
};

type ReceivedReportHistorySummaryRow = {
  totalCount: bigint;
  reportIds: number[];
};

type CustomerReportTargetScope = {
  uuidIds: Prisma.Sql;
  textIds: Prisma.Sql;
};

/**
 * 고객 본인과 고객이 작성한 콘텐츠에 접수된 신고를 고객 ID별 행으로 반환합니다.
 *
 * 목록 집계(전체/페이지 범위)와 상세 이력이 같은 피신고 대상 기준을 사용하도록 공통으로 관리합니다.
 * 범위를 지정하지 않으면 전체 고객을, 지정하면 해당 고객만 대상으로 조회합니다.
 */
function buildCustomerReceivedReportTargetsSql(scope?: CustomerReportTargetScope): Prisma.Sql {
  return Prisma.sql`
    SELECT rp.id AS "reportId", rp.created_at AS "createdAt", rp.target_id AS "customerId", rp.status
    FROM reports AS rp
    WHERE rp.target_type = ${ReportTargetType.CUSTOMER}::"ReportTargetType"
      ${scope ? Prisma.sql`AND rp.target_id IN (${scope.textIds})` : Prisma.empty}

    UNION ALL

    SELECT rp.id AS "reportId", rp.created_at AS "createdAt", rv.customer_id::text AS "customerId", rp.status
    FROM reviews AS rv
    INNER JOIN reports AS rp
      ON rp.target_type = ${ReportTargetType.REVIEW}::"ReportTargetType"
      AND rp.target_id = rv.id::text
    ${scope ? Prisma.sql`WHERE rv.customer_id IN (${scope.uuidIds})` : Prisma.empty}

    UNION ALL

    SELECT rp.id AS "reportId", rp.created_at AS "createdAt", rr.author_id::text AS "customerId", rp.status
    FROM residence_reviews AS rr
    INNER JOIN reports AS rp
      ON rp.target_type = ${ReportTargetType.RESIDENCE_REVIEW}::"ReportTargetType"
      AND rp.target_id = rr.id::text
    ${scope ? Prisma.sql`WHERE rr.author_id IN (${scope.uuidIds})` : Prisma.empty}

    UNION ALL

    SELECT rp.id AS "reportId", rp.created_at AS "createdAt", g.author_id::text AS "customerId", rp.status
    FROM giveaways AS g
    INNER JOIN reports AS rp
      ON rp.target_type = ${ReportTargetType.GIVEAWAY}::"ReportTargetType"
      AND rp.target_id = g.id::text
    ${scope ? Prisma.sql`WHERE g.author_id IN (${scope.uuidIds})` : Prisma.empty}
  `;
}

/**
 * `sorts` 파라미터로 받은 정렬 기준들을 순서대로 SQL ORDER BY 절로 변환합니다.
 *
 * `CREATED_AT_DESC` 또는 `CREATED_AT_ASC`가 없는 경우,
 * `createdAt DESC`, `id ASC`를 보조 정렬로 붙여 페이지 순서를 고정합니다.
 */
function buildCustomerReportOrderBy(sorts: string[]): Prisma.Sql {
  const columns: Record<string, Prisma.Sql> = {
    PENDING_DESC: Prisma.sql`"pendingReceivedReportCount" DESC`,
    PENDING_ASC: Prisma.sql`"pendingReceivedReportCount" ASC`,
    OPEN_INQUIRY_DESC: Prisma.sql`"openInquiryCount" DESC`,
    OPEN_INQUIRY_ASC: Prisma.sql`"openInquiryCount" ASC`,
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

/**
 * 신고·문의 집계값이 아닌 가입일로만 정렬하는지 확인합니다.
 * 가입일 정렬에서는 먼저 현재 페이지의 고객을 정한 뒤, 그 고객들에 한해서만 집계합니다.
 */
function isCreatedAtOnlySort(sorts: string[]): boolean {
  return sorts.every((sort) => sort === "CREATED_AT_DESC" || sort === "CREATED_AT_ASC");
}

function buildCustomerCreatedAtOrderBy(sorts: string[]): Prisma.Sql {
  const sort = sorts.find((value) => value === "CREATED_AT_DESC" || value === "CREATED_AT_ASC");

  return sort === "CREATED_AT_ASC"
    ? Prisma.sql`u."createdAt" ASC, u.id ASC`
    : Prisma.sql`u."createdAt" DESC, u.id ASC`;
}

/** 고객 목록의 요청받은 필터를 raw SQL WHERE 절로 만듭니다. */
function buildCustomerListWhereSql(filters: ListCustomerQuery): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`u.role = ${UserRole.CUSTOMER}::"UserRole"`];

  if (filters.status === MEMBER_STATUS.ACTIVE) {
    conditions.push(Prisma.sql`u."deletedAt" IS NULL AND u."isActive" = TRUE`);
  } else if (filters.status === MEMBER_STATUS.SUSPENDED) {
    conditions.push(Prisma.sql`u."deletedAt" IS NULL AND u."isActive" = FALSE`);
  } else if (filters.status === MEMBER_STATUS.WITHDRAWN) {
    conditions.push(Prisma.sql`u."deletedAt" IS NOT NULL`);
  } else {
    conditions.push(Prisma.sql`u."deletedAt" IS NULL`);
  }

  if (filters.isProfileCompleted !== undefined) {
    conditions.push(Prisma.sql`u."isProfileCompleted" = ${filters.isProfileCompleted}`);
  }

  if (filters.authProvider) {
    conditions.push(Prisma.sql`u."authProvider" = ${filters.authProvider}::"AuthProvider"`);
  }

  if (filters.keyword) {
    const pattern = `%${filters.keyword}%`;
    conditions.push(Prisma.sql`(u.name ILIKE ${pattern} OR u.email ILIKE ${pattern})`);
  }

  if (filters.fromDate) {
    const marker = parseDateMarker(filters.fromDate);
    if (!marker) throw new Error("Validated customer-list fromDate could not be parsed.");
    conditions.push(Prisma.sql`u."createdAt" >= ${kstDayStart(marker)}`);
  }
  if (filters.toDate) {
    const marker = parseDateMarker(filters.toDate);
    if (!marker) throw new Error("Validated customer-list toDate could not be parsed.");
    conditions.push(Prisma.sql`u."createdAt" <= ${kstDayEnd(marker)}`);
  }

  return Prisma.join(conditions, " AND ");
}

export const customersRepository = {
  /** 고객 목록과 고객 본인·작성 콘텐츠에 접수된 신고, 고객이 접수한 미처리 문의 건수를 함께 조회합니다. */
  async findManyWithCount({ skip, take, sorts, filters }: ListParams, db: DbClient = prisma) {
    const whereSql = buildCustomerListWhereSql(filters);

    if (isCreatedAtOnlySort(sorts)) {
      return this.findManyWithPageScopedCounts({ skip, take, sorts, whereSql }, db);
    }

    /** 필터·피신고 집계·미처리 문의 집계·다중 정렬을 적용한 전체 결과에서 현재 페이지를 조회합니다. */
    const rows = await db.$queryRaw<CustomerListRawRow[]>(Prisma.sql`
        SELECT
          u.id,
          u.email,
          u.name,
          u.phone,
          u."authProvider",
          u."isActive",
          u."isProfileCompleted",
          u."deletedAt",
          u."createdAt",
          COALESCE(rc."receivedReportCount", 0)::int AS "receivedReportCount",
          COALESCE(rc."pendingReceivedReportCount", 0)::int AS "pendingReceivedReportCount",
          COALESCE(oi."openInquiryCount", 0) AS "openInquiryCount",
          COUNT(*) OVER()::bigint AS "totalCount"
        FROM "User" AS u
        LEFT JOIN (
          SELECT i.author_id, COUNT(*)::int AS "openInquiryCount"
          FROM inquiries AS i
          WHERE i.status = ${InquiryStatus.OPEN}::"InquiryStatus"
          GROUP BY i.author_id
        ) AS oi ON oi.author_id = u.id
        LEFT JOIN (
          SELECT
            report_targets."customerId",
            COUNT(*)::int AS "receivedReportCount",
            COUNT(*) FILTER (WHERE report_targets.status = ${ReportStatus.PENDING}::"ReportStatus")::int
              AS "pendingReceivedReportCount"
          FROM (${buildCustomerReceivedReportTargetsSql()}) AS report_targets
          GROUP BY report_targets."customerId"
        ) AS rc ON rc."customerId" = u.id::text
        WHERE ${whereSql}
        ORDER BY ${buildCustomerReportOrderBy(sorts)}
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

    return {
      customers: rows.map(({ totalCount: _totalCount, ...customer }) => customer),
      totalCount,
    };
  },

  /**
   * 가입일 정렬은 결과 페이지를 먼저 확정할 수 있으므로,
   * 문의·신고 건수도 현재 페이지 고객으로 범위를 제한해 집계합니다.
   * 미처리 신고 수 또는 OPEN 문의 수로 정렬할 때는 전체 후보의 순위를 계산해야 하므로
   * 기존 조회 경로를 사용합니다.
   */
  async findManyWithPageScopedCounts(
    {
      skip,
      take,
      sorts,
      whereSql,
    }: Pick<ListParams, "skip" | "take" | "sorts"> & { whereSql: Prisma.Sql },
    db: DbClient = prisma,
  ) {
    // 페이지 항목과 전체 건수는 서로 의존하지 않으므로 동시에 조회한다.
    const [pageRows, countRows] = await Promise.all([
      db.$queryRaw<CustomerListPageRow[]>(Prisma.sql`
        SELECT
          u.id,
          u.email,
          u.name,
          u.phone,
          u."authProvider",
          u."isActive",
          u."isProfileCompleted",
          u."deletedAt",
          u."createdAt"
        FROM "User" AS u
        WHERE ${whereSql}
        ORDER BY ${buildCustomerCreatedAtOrderBy(sorts)}
        LIMIT ${take} OFFSET ${skip}
      `),
      db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "User" AS u
        WHERE ${whereSql}
      `),
    ]);

    // 페이지가 비어 있으면 후속 IN (...) 집계를 생략한다.
    if (pageRows.length === 0) {
      return { customers: [] as CustomerListRow[], totalCount: Number(countRows[0]?.count ?? 0) };
    }

    const customerIds = pageRows.map((customer) => customer.id);
    const customerIdUuidSql = Prisma.join(
      customerIds.map((customerId) => Prisma.sql`${customerId}::uuid`),
    );
    const customerIdTextSql = Prisma.join(
      customerIds.map((customerId) => Prisma.sql`${customerId}`),
    );

    // 현재 페이지 고객에 대해서만 문의·신고 건수를 동시에 집계한다.
    const [openInquiryCounts, receivedReportCounts] = await Promise.all([
      db.$queryRaw<OpenInquiryCountRow[]>(Prisma.sql`
        SELECT i.author_id AS "customerId", COUNT(*)::int AS "openInquiryCount"
        FROM inquiries AS i
        WHERE i.status = ${InquiryStatus.OPEN}::"InquiryStatus"
          AND i.author_id IN (${customerIdUuidSql})
        GROUP BY i.author_id
      `),
      db.$queryRaw<ReceivedReportCountRow[]>(Prisma.sql`
        SELECT
          report_targets."customerId",
          COUNT(*)::int AS "receivedReportCount",
          COUNT(*) FILTER (WHERE report_targets.status = ${ReportStatus.PENDING}::"ReportStatus")::int
            AS "pendingReceivedReportCount"
        FROM (${buildCustomerReceivedReportTargetsSql({
          uuidIds: customerIdUuidSql,
          textIds: customerIdTextSql,
        })}) AS report_targets
        GROUP BY report_targets."customerId"
      `),
    ]);

    const openInquiryCountByCustomerId = new Map(
      openInquiryCounts.map((row) => [row.customerId, row.openInquiryCount]),
    );
    const receivedReportCountByCustomerId = new Map(
      receivedReportCounts.map((row) => [row.customerId, row]),
    );

    return {
      customers: pageRows.map((customer) => {
        const reportCounts = receivedReportCountByCustomerId.get(customer.id);

        return {
          ...customer,
          receivedReportCount: reportCounts?.receivedReportCount ?? 0,
          pendingReceivedReportCount: reportCounts?.pendingReceivedReportCount ?? 0,
          openInquiryCount: openInquiryCountByCustomerId.get(customer.id) ?? 0,
        } satisfies CustomerListRow;
      }),
      totalCount: Number(countRows[0]?.count ?? 0),
    };
  },

  /**
   * ID와 CUSTOMER 역할이 일치하는 고객 상세를 조회합니다.
   * 탈퇴 회원도 관리자 상세 조회 대상이므로 deletedAt으로 제한하지 않습니다.
   */
  findCustomerById(customerId: string, db: DbClient = prisma) {
    return db.user.findFirst({
      where: {
        id: customerId,
        role: UserRole.CUSTOMER,
      },
      select: customerDetailSelect,
    });
  },

  /**
   * 고객이 생성한 견적 요청 이력의 최신 일부와 전체 건수를 조회합니다.
   * 상세 화면은 최신 이력만 표시하되, 전체 건수도 함께 보여줍니다.
   */
  async findEstimateHistory(
    { customerId, take = CUSTOMER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    const where: Prisma.EstimateRequestWhereInput = { customerId };

    const [items, totalCount] = await Promise.all([
      db.estimateRequest.findMany({
        where,
        select: estimateHistorySelect,
        // 고객은 활성 견적 요청을 최대 1건만 가질 수 있으므로, 현재 진행 거래를
        // 최신 이력 5건 밖으로 밀어내지 않도록 활성 요청을 먼저 노출합니다.
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }, { id: "asc" }],
        take,
      }),
      db.estimateRequest.count({ where }),
    ]);

    return { items, totalCount };
  },

  /**
   * 고객이 작성한 리뷰 이력의 최신 일부와 전체 건수를 조회합니다.
   * 기사 프로필 닉네임이 없을 때 mapper가 기사 실명으로 대체할 수 있도록 함께 조회합니다.
   */
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

  /**
   * 고객이 신고자로 등록된 신고 이력(신고한 내역)의 최신 일부와 전체 건수를 조회합니다.
   */
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

  /** 고객 본인 또는 고객이 작성한 콘텐츠를 대상으로 접수된 신고의 최신 일부와 전체 건수를 조회합니다. */
  async findReceivedReportHistory(
    { customerId, take = CUSTOMER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    const customerIdUuidSql = Prisma.sql`${customerId}::uuid`;
    const customerIdTextSql = Prisma.sql`${customerId}`;
    const [summary] = await db.$queryRaw<ReceivedReportHistorySummaryRow[]>(Prisma.sql`
      WITH report_targets AS (
        ${buildCustomerReceivedReportTargetsSql({
          uuidIds: customerIdUuidSql,
          textIds: customerIdTextSql,
        })}
      ), ranked_report_targets AS (
        SELECT
          "reportId",
          ROW_NUMBER() OVER (ORDER BY "createdAt" DESC, "reportId" ASC) AS row_number
        FROM report_targets
      )
      SELECT
        COUNT(*)::bigint AS "totalCount",
        COALESCE(
          array_agg("reportId" ORDER BY row_number) FILTER (WHERE row_number <= ${take}),
          ARRAY[]::integer[]
        ) AS "reportIds"
      FROM ranked_report_targets
    `);

    const reportIds = summary?.reportIds ?? [];
    const items = reportIds.length
      ? await db.report.findMany({
          where: { id: { in: reportIds } },
          select: reportHistorySelect,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        })
      : [];

    return { items, totalCount: Number(summary?.totalCount ?? 0) };
  },
};
