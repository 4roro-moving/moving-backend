import { EstimateRequestStatus, EstimateStatus, ReportTargetType, UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { DbClient } from "../../../../utils/transaction";
import { prisma } from "../../../../lib/prisma";

/** 기사 목록 DTO 변환에 필요한 User 및 MoverProfile 조회 필드입니다. */
const moverListSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  isActive: true,
  isProfileCompleted: true,
  deletedAt: true,
  createdAt: true,
  moverProfile: {
    select: {
      nickname: true,
      career: true,
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

/** 기사 계정·프로필과 서비스 지역/유형을 포함한 상세 조회 필드입니다. */
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

export type MoverListRow = Prisma.UserGetPayload<{ select: typeof moverListSelect }>;
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
  where: Prisma.UserWhereInput;
  orderBy: Prisma.UserOrderByWithRelationInput[];
};

type HistoryParams = {
  moverId: string;
  take?: number;
};

/** 상세 화면에서 각 이력 항목별로 제공하는 기본 최신 건수입니다. */
export const MOVER_HISTORY_LIMIT = 5;

export const moversRepository = {
  /**
   * 목록과 전체 건수를 동일한 필터 조건으로 병렬 조회합니다.
   */
  async findManyWithCount({ skip, take, where, orderBy }: ListParams, db: DbClient = prisma) {
    const [movers, totalCount] = await Promise.all([
      db.user.findMany({
        where,
        select: moverListSelect,
        orderBy,
        skip,
        take,
      }),
      db.user.count({ where }),
    ]);

    return { movers, totalCount };
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
