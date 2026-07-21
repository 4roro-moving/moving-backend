import { reviewRepository } from "../repositories/review.repository";

type GetReviewableEstimateListParams = {
  // 현재 로그인한 고객 기준으로 고객 ID를 전달받아 리뷰 작성 가능한 견적 리스트를 조회
  customerId: string;
};

export const reviewService = {
  async getReviewableEstimateList({ customerId }: GetReviewableEstimateListParams) {
    const estimates = await reviewRepository.findReviewableEstimatesByCustomerId(customerId);

    return {
      reviewableEstimates: estimates.map((estimate) => ({
        estimateId: estimate.id,
        price: estimate.price,
        confirmedAt: estimate.confirmedAt,
        estimateRequest: {
          id: estimate.estimateRequest.id,
          moveType: estimate.estimateRequest.moveType,
          moveDate: estimate.estimateRequest.moveDate,
          fromAddress: estimate.estimateRequest.fromAddress,
          toAddress: estimate.estimateRequest.toAddress,
          status: estimate.estimateRequest.status,
        },
        mover: {
          id: estimate.mover.id,

          // 기사 프로필 정책이 확정되기 전까지는 데이터 불일치에 대비해 nullable 방어를 유지
          nickname: estimate.mover.moverProfile?.nickname ?? null,
          imageUrl: estimate.mover.moverProfile?.imageUrl ?? null,
          career: estimate.mover.moverProfile?.career ?? 0,

          // Prisma Decimal은 API 응답에서 다루기 쉽도록 number로 변환
          averageRating: Number(estimate.mover.moverProfile?.averageRating ?? 0),

          reviewCount: estimate.mover.moverProfile?.reviewCount ?? 0,
        },
      })),
    };
  },
};
