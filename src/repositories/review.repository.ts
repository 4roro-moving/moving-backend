import { EstimateRequestStatus, EstimateStatus, type Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";

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
} satisfies Prisma.EstimateSelect;

export const reviewRepository = {
  findReviewableEstimatesByCustomerId(customerId: string) {
    return prisma.estimate.findMany({
      where: {
        // 고객이 확정한 견적만 리뷰 작성 가능
        status: EstimateStatus.CONFIRMED,

        // Review와 Estimate는 1:1 관계이므로 이미 리뷰가 있으면 작성 대상에서 제외
        review: null,

        estimateRequest: {
          // 현재 고객의 요청만 조회
          customerId,

          // 견적 요청 흐름상 확정 또는 완료 상태인 요청만 리뷰 작성 대상으로 확인
          status: {
            in: [EstimateRequestStatus.CONFIRMED, EstimateRequestStatus.COMPLETED],
          },
        },
      },
      select: reviewableEstimateSelect,
      orderBy: {
        // 최근순으로 정렬
        confirmedAt: "desc",
      },
    });
  },
};
