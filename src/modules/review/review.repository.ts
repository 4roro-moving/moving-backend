import {
  EstimateRequestStatus,
  EstimateStatus,
  Prisma,
  type Prisma as PrismaType,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

const reviewableEstimateSelect = {
  id: true,
  price: true,
  confirmedAt: true,
  estimateRequest: {
    select: {
      id: true,
      moveType: true,
      moveDate: true,
      fromAddress: true,
      toAddress: true,
      status: true,
    },
  },
  mover: {
    select: {
      id: true,
      moverProfile: {
        select: {
          nickname: true,
          imageUrl: true,
          career: true,
          averageRating: true,
          reviewCount: true,
        },
      },
    },
  },
} satisfies PrismaType.EstimateSelect;

export type ReviewableEstimateRow = PrismaType.EstimateGetPayload<{
  select: typeof reviewableEstimateSelect;
}>;

// 리뷰 작성 대상 견적 조회 시 필요한 필드만 선택
const reviewTargetEstimateSelect = {
  id: true,
  moverId: true,
  status: true,
  review: {
    select: {
      id: true,
    },
  },
  estimateRequest: {
    select: {
      customerId: true,
      status: true,
    },
  },
  mover: {
    select: {
      moverProfile: {
        select: {
          id: true,
        },
      },
    },
  },
} satisfies PrismaType.EstimateSelect;

export type ReviewTargetEstimateRow = PrismaType.EstimateGetPayload<{
  select: typeof reviewTargetEstimateSelect;
}>;

const myReviewSelect = {
  id: true,
  estimateId: true,
  rating: true,
  content: true,
  createdAt: true,
  estimate: {
    select: {
      price: true,
      estimateRequest: {
        select: {
          id: true,
          moveType: true,
          moveDate: true,
          fromAddress: true,
          toAddress: true,
        },
      },
    },
  },
  mover: {
    select: {
      id: true,
      name: true,
      moverProfile: {
        select: {
          nickname: true,
          imageUrl: true,
          shortIntro: true,
        },
      },
    },
  },
} satisfies PrismaType.ReviewSelect;

export type MyReviewRow = PrismaType.ReviewGetPayload<{
  select: typeof myReviewSelect;
}>;

// 기사님 상세 화면의 리뷰 목록에 필요한 필드만 선택
const moverReviewSelect = {
  id: true,
  rating: true,
  content: true,
  createdAt: true,
  customer: {
    select: {
      id: true,
      email: true,
      customerProfile: {
        select: {
          imageUrl: true,
        },
      },
    },
  },
  estimate: {
    select: {
      estimateRequest: {
        select: {
          id: true,
          moveType: true,
          moveDate: true,
        },
      },
    },
  },
} satisfies PrismaType.ReviewSelect;

export type MoverReviewRow = PrismaType.ReviewGetPayload<{
  select: typeof moverReviewSelect;
}>;

type CreateReviewData = {
  customerId: string;
  moverId: string;
  estimateId: number;
  rating: number;
  content: string;
};

export const reviewRepository = {
  // 리뷰 목록 조회 전 기사님 존재 여부 확인
  findMoverForReviewList(moverId: string, db: DbClient = prisma) {
    return db.user.findFirst({
      where: {
        id: moverId,
        role: "MOVER",
        isActive: true,
        isProfileCompleted: true,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
  },

  findMyReviewsByCustomerId(customerId: string, skip: number, take: number, db: DbClient = prisma) {
    return db.review.findMany({
      where: {
        customerId,
      },
      select: myReviewSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    });
  },

  countMyReviewsByCustomerId(customerId: string, db: DbClient = prisma) {
    return db.review.count({
      where: {
        customerId,
      },
    });
  },

  // 특정 기사님에게 작성된 리뷰 목록 조회
  findReviewsByMoverId(moverId: string, skip: number, take: number, db: DbClient = prisma) {
    return db.review.findMany({
      where: {
        moverId,
      },
      select: moverReviewSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    });
  },

  // 특정 기사님에게 작성된 전체 리뷰 수 조회
  countReviewsByMoverId(moverId: string, db: DbClient = prisma) {
    return db.review.count({
      where: {
        moverId,
      },
    });
  },

  findReviewableEstimatesByCustomerId(customerId: string, db: DbClient = prisma) {
    return db.estimate.findMany({
      where: {
        // 개별 견적이 고객이 선택한 확정 견적인지 확인
        status: EstimateStatus.CONFIRMED,

        // 이미 리뷰가 있으면 작성 대상에서 제외
        review: null,

        estimateRequest: {
          // 다른 고객의 견적이 섞이지 않도록 현재 고객의 요청만 조회
          customerId,

          // 서비스 이용 완료 후에만 리뷰를 작성할 수 있으므로 요청 상태는 COMPLETED만 허용
          status: EstimateRequestStatus.COMPLETED,
        },
      },
      select: reviewableEstimateSelect,
      orderBy: {
        // 최근 확정된 견적이 먼저 보이도록 정렬
        confirmedAt: "desc",
      },
    });
  },

  // 리뷰 작성 대상 견적 조회
  findEstimateForReviewById(estimateId: number, db: DbClient = prisma) {
    return db.estimate.findUnique({
      where: {
        id: estimateId,
      },
      select: reviewTargetEstimateSelect,
    });
  },

  // Review 생성
  createReview(
    { customerId, moverId, estimateId, rating, content }: CreateReviewData,
    db: DbClient = prisma,
  ) {
    return db.review.create({
      data: {
        customerId,
        moverId,
        estimateId,
        rating,
        content,
      },
      select: {
        id: true,
        estimateId: true,
        rating: true,
        content: true,
        createdAt: true,
      },
    });
  },

  // 기사님의 전체 리뷰 평균과 개수 조회
  aggregateMoverReviewStats(moverId: string, db: DbClient = prisma) {
    return db.review.aggregate({
      where: {
        moverId,
      },
      _avg: {
        rating: true,
      },
      _count: {
        _all: true,
      },
    });
  },

  // 기사님 프로필의 리뷰 통계 갱신
  updateMoverReviewStats(
    {
      moverId,
      averageRating,
      reviewCount,
    }: {
      moverId: string;
      averageRating: number;
      reviewCount: number;
    },
    db: DbClient = prisma,
  ) {
    return db.moverProfile.update({
      where: {
        userId: moverId,
      },
      data: {
        averageRating: new Prisma.Decimal(averageRating),
        reviewCount,
      },
    });
  },
};
