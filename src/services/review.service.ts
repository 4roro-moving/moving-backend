import { EstimateRequestStatus, EstimateStatus } from "@prisma/client";

import { AppError } from "../lib/app-error";
import { reviewRepository } from "../repositories/review.repository";

type GetReviewableEstimateListParams = {
  // 현재 로그인한 고객 기준으로 고객 ID를 전달받아 리뷰 작성 가능한 견적 리스트를 조회
  customerId: string;
};

type CreateReviewParams = {
  customerId: string;
  estimateId: number;
  rating: number;
  content: string;
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

  async createReview({ customerId, estimateId, rating, content }: CreateReviewParams) {
    const estimate = await reviewRepository.findEstimateForReviewById(estimateId);

    if (!estimate) {
      throw new AppError("NOT_FOUND", {
        message: "견적을 찾을 수 없습니다.",
      });
    }

    if (estimate.estimateRequest.customerId !== customerId) {
      throw new AppError("FORBIDDEN", {
        message: "본인의 견적에만 리뷰를 작성할 수 있습니다.",
      });
    }

    if (estimate.status !== EstimateStatus.CONFIRMED) {
      throw new AppError("BAD_REQUEST", {
        message: "확정된 견적에만 리뷰를 작성할 수 있습니다.",
      });
    }

    if (estimate.estimateRequest.status !== EstimateRequestStatus.COMPLETED) {
      throw new AppError("BAD_REQUEST", {
        message: "서비스 이용이 완료된 견적에만 리뷰를 작성할 수 있습니다.",
      });
    }

    if (estimate.review) {
      throw new AppError("CONFLICT", {
        message: "이미 리뷰를 작성한 견적입니다.",
      });
    }

    const moverProfileId = estimate.mover.moverProfile;

    if (!moverProfileId) {
      throw new AppError("BAD_REQUEST", {
        message: "기사님 프로필이 없어 리뷰를 작성할 수 없습니다.",
      });
    }

    const review = await reviewRepository.createReviewAndUpdateMoverStats({
      customerId,
      moverId: estimate.moverId,
      estimateId: estimate.id,
      rating,
      content,
    });

    return {
      review,
    };
  },
};
