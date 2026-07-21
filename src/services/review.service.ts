import { reviewRepository } from "../repositories/review.repository";

type GetReviewableEstimateListParams = {
  // 현재 로그인한 고객 기준으로 고객 ID를 전달받아 리뷰 작성 가능한 견적 리스트를 조회
  customerId: string;
};

export const reviewService = {
  async getReviewableEstimateList({ customerId }: GetReviewableEstimateListParams) {
    const estimates = await reviewRepository.findReviewableEstimatesByCustomerId(customerId);

    return {
      reviewableEstimates: estimates.map((estimate) => {
        const moverProfile = estimate.mover.moverProfile;

        return {
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

            // 프로필이 없는 경우 실제 0 값과 구분할 수 있도록 null을 반환
            nickname: moverProfile?.nickname ?? null,
            imageUrl: moverProfile?.imageUrl ?? null,
            career: moverProfile?.career ?? null,

            // Prisma Decimal은 API 응답에서 다루기 쉽도록 number로 변환
            averageRating: moverProfile ? Number(moverProfile.averageRating) : null,

            reviewCount: moverProfile?.reviewCount ?? null,
          },
        };
      }),
    };
  },
};
