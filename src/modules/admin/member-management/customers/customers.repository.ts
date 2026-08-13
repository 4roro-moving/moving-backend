import { ReportTargetType, UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import type { DbClient } from "../../../../utils/transaction";
import {
  buildReceivedReportCountsByMemberId,
  sortMembersByPendingReceivedReportCount,
} from "../member.policy";
import type { MemberReceivedReportCounts } from "../member.type";
import type { MemberPendingReportSort } from "../member-list.validator";

/** 고객 상세 응답에서 각 이력 항목별로 제공하는 기본 최신 건수입니다. */
export const CUSTOMER_HISTORY_LIMIT = 5;

/** 고객 목록 DTO 변환에 필요한 최소 필드입니다. */
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

/** 고객 계정·프로필과 서비스 지역/유형을 포함한 상세 조회 필드입니다. */
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

/** 고객 상세의 견적 요청 이력 요약에 필요한 필드입니다. */
const estimateHistorySelect = {
  id: true,
  moveType: true,
  status: true,
  moveDate: true,
  createdAt: true,
} satisfies Prisma.EstimateRequestSelect;

/** 고객이 작성한 리뷰와 작성 당시 기사 표시명에 필요한 필드입니다. */
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

/** 고객이 신고했거나 고객 리뷰가 피신고된 신고 이력 요약 필드입니다. */
const reportHistorySelect = {
  id: true,
  targetType: true,
  targetId: true,
  reason: true,
  status: true,
  createdAt: true,
} satisfies Prisma.ReportSelect;

type CustomerListBaseRow = Prisma.UserGetPayload<{ select: typeof customerListSelect }>;

export type CustomerListRow = CustomerListBaseRow & {} & MemberReceivedReportCounts;
export type CustomerDetailRow = Prisma.UserGetPayload<{ select: typeof customerDetailSelect }>;
export type EstimateHistoryRow = Prisma.EstimateRequestGetPayload<{
  select: typeof estimateHistorySelect;
}>;
export type ReviewHistoryRow = Prisma.ReviewGetPayload<{ select: typeof reviewHistorySelect }>;
export type ReportHistoryRow = Prisma.ReportGetPayload<{ select: typeof reportHistorySelect }>;

type ListParams = {
  skip: number;
  take: number;
  where: Prisma.UserWhereInput;
  orderBy: Prisma.UserOrderByWithRelationInput[];
  reportSort?: MemberPendingReportSort;
};

type HistoryParams = {
  customerId: string;
  take?: number;
};

export const customersRepository = {
  /**
   * 목록과 전체 건수를 동일한 필터 조건으로 병렬 조회합니다.
   */
  async findManyWithCount(
    { skip, take, where, orderBy, reportSort }: ListParams,
    db: DbClient = prisma,
  ) {
    const [customers, totalCount] = await Promise.all([
      db.user.findMany({
        where,
        select: customerListSelect,
        orderBy,
        ...(reportSort ? {} : { skip, take }),
      }),
      db.user.count({ where }),
    ]);

    if (customers.length === 0) {
      return { customers: [] as CustomerListRow[], totalCount };
    }

    /**
     * 고객은 현재 Report의 직접 신고 대상이 아니므로, 고객이 작성한 REVIEW를 통해 피신고 건수를 집계합니다.
     *
     * NOTE:
     * 추후 신고 대상이 추가되면 대상 소유자별 집계를 확장하거나
     * Report.reportedUserId를 추가해 직접 집계하는 방식으로 전환합니다.
     */
    const reviews = await db.review.findMany({
      where: { customerId: { in: customers.map((customer) => customer.id) } },
      select: { id: true, customerId: true },
    });

    if (reviews.length === 0) {
      return {
        customers: (reportSort ? customers.slice(skip, skip + take) : customers).map(
          (customer) => ({
            ...customer,
            receivedReportCount: 0,
            pendingReceivedReportCount: 0,
          }),
        ),
        totalCount,
      };
    }

    const customerIdByReviewId = new Map(
      reviews.map((review) => [String(review.id), review.customerId]),
    );
    const reportGroups = await db.report.groupBy({
      by: ["targetId", "status"],
      where: {
        targetType: ReportTargetType.REVIEW,
        targetId: { in: [...customerIdByReviewId.keys()] },
      },
      _count: { _all: true },
    });
    const countsByCustomerId = buildReceivedReportCountsByMemberId(
      reportGroups.flatMap((group) => {
        const customerId = customerIdByReviewId.get(group.targetId);
        return customerId
          ? [{ memberId: customerId, status: group.status, count: group._count._all }]
          : [];
      }),
    );

    const customersWithReportCounts = customers.map((customer) => {
      const counts = countsByCustomerId.get(customer.id) ?? {
        receivedReportCount: 0,
        pendingReceivedReportCount: 0,
      };
      return {
        ...customer,
        ...counts,
      };
    });

    const sortedCustomers = sortMembersByPendingReceivedReportCount(
      customersWithReportCounts,
      reportSort,
    );

    return {
      customers: reportSort ? sortedCustomers.slice(skip, skip + take) : sortedCustomers,
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
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
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
