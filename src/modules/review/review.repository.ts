import {
  EstimateRequestStatus,
  EstimateStatus,
  Prisma,
  type Prisma as PrismaType,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";

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

type CreateReviewData = {
  customerId: string;
  moverId: string;
  estimateId: number;
  rating: number;
  content: string;
};

export const reviewRepository = {
  findMyReviewsByCustomerId(customerId: string, skip: number, take: number) {
    return prisma.review.findMany({
      where: {
        customerId,
      },
      select: myReviewSelect,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take,
    });
  },

  countMyReviewsByCustomerId(customerId: string) {
    return prisma.review.count({
      where: {
        customerId,
      },
    });
  },

  findReviewableEstimatesByCustomerId(customerId: string) {
    return prisma.estimate.findMany({
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
  findEstimateForReviewById(estimateId: number) {
    return prisma.estimate.findUnique({
      where: {
        id: estimateId,
      },
      select: reviewTargetEstimateSelect,
    });
  },

  // Review 생성, 해당 기사님의 전체 리뷰 평균 계산, 기사님 프로필의 averageRating, reviewCount 갱신 중 하나라도 실패하면 데이터 불일치가 발생하기에 하나의 트랜잭션으로 묶어 처리
  createReviewAndUpdateMoverStats({
    customerId,
    moverId,
    estimateId,
    rating,
    content,
  }: CreateReviewData) {
    return prisma.$transaction(
      async (tx) => {
        const review = await tx.review.create({
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

        const reviewStats = await tx.review.aggregate({
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

        const averageRating = reviewStats._avg.rating ?? 0;
        const roundedAverageRating = Math.round(averageRating * 10) / 10;

        await tx.moverProfile.update({
          where: {
            userId: moverId,
          },
          data: {
            averageRating: new Prisma.Decimal(roundedAverageRating),
            reviewCount: reviewStats._count._all,
          },
        });

        return review;
      },
      {
        // 같은 기사님에게 여러 리뷰가 동시에 등록될 때 통계 재계산 결과가 덮어써지는 것을 방지
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  },
};
