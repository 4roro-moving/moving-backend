import { InquiryStatus, Prisma, ReportTargetType, UserRole } from "@prisma/client";
import type { AuthProvider } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import { kstDayEnd, kstDayStart, parseDateMarker } from "../../../../utils/kst";
import type { DbClient } from "../../../../utils/transaction";
import type { MemberReceivedReportCounts } from "../member.type";
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

/** 고객 목록의 요청받은 필터를 raw SQL WHERE 절로 만듭니다. */
function buildCustomerListWhereSql(filters: ListCustomerQuery): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`u.role = ${UserRole.CUSTOMER}::"UserRole"`];

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
  /** 고객 목록과 리뷰 기반 피신고·고객이 접수한 미처리 문의 건수를 함께 조회합니다. */
  async findManyWithCount({ skip, take, sorts, filters }: ListParams, db: DbClient = prisma) {
    const whereSql = buildCustomerListWhereSql(filters);

    /**
     * 필터·리뷰 기반 신고 집계·미처리 문의 집계·다중 정렬을 적용한 전체 결과에서 LIMIT/OFFSET을 적용해 현재 페이지 행만 조회합니다.
     */
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
          COUNT(rp.id)::int AS "receivedReportCount",
          COUNT(rp.id) FILTER (WHERE rp.status = ${"PENDING"}::"ReportStatus")::int
            AS "pendingReceivedReportCount",
          COALESCE((
            SELECT COUNT(*)::int
            FROM inquiries AS i
            WHERE i.author_id = u.id
              AND i.status = ${InquiryStatus.OPEN}::"InquiryStatus"
          ), 0) AS "openInquiryCount",
          COUNT(*) OVER()::bigint AS "totalCount"
        FROM "User" AS u
        LEFT JOIN reviews AS rv ON rv.customer_id = u.id
        LEFT JOIN reports AS rp
          ON rp.target_type = ${ReportTargetType.REVIEW}::"ReportTargetType"
          AND rp.target_id = rv.id::text
        WHERE ${whereSql}
        GROUP BY
          u.id,
          u.email,
          u.name,
          u.phone,
          u."authProvider",
          u."isActive",
          u."isProfileCompleted",
          u."deletedAt",
          u."createdAt"
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

  /**
   * 고객이 작성한 리뷰가 신고된 내역(피신고)의 최신 일부와 전체 건수를 조회합니다.
   * Customer는 ReportTargetType 상 직접 신고 대상이 될 수 없어, 먼저 고객 리뷰 ID를 찾습니다.
   */
  async findReceivedReportHistory(
    { customerId, take = CUSTOMER_HISTORY_LIMIT }: HistoryParams,
    db: DbClient = prisma,
  ) {
    // Report.targetId는 문자열이므로 리뷰의 숫자 ID를 문자열로 변환해 IN 조건에 사용
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
};
