import { Prisma } from "@prisma/client";

import logger from "../../config/logger";
import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";
import { runTransaction } from "../../utils/transaction";
import { notificationService } from "../notification/notification.service";
import { mapMoverReview, mapMyReview, mapReviewableEstimate } from "./review.mapper";
import { assertReviewCreatable } from "./review.policy";
import { reviewRepository } from "./review.repository";

type GetMyReviewListParams = {
  customerId: string;
  page: number;
  limit: number;
};

type GetMoverReviewListParams = {
  moverId: string;
  page: number;
  limit: number;
};

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

function isReviewEstimateUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  const reviewEstimateFields = ["estimateid", "estimate_id"];

  if (Array.isArray(target)) {
    return target.some((field) => reviewEstimateFields.includes(String(field).toLowerCase()));
  }

  return reviewEstimateFields.some((field) => String(target).toLowerCase().includes(field));
}

export const reviewService = {
  async getMoverReviewList({ moverId, page, limit }: GetMoverReviewListParams) {
    // 기사님 리뷰 조회 전 기사님 존재 여부 확인
    const mover = await reviewRepository.findMoverForReviewList(moverId);

    if (!mover) {
      throw new AppError("MOVER_NOT_FOUND");
    }

    const skip = (page - 1) * limit;

    // 리뷰 목록과 전체 개수를 함께 조회
    const [reviews, totalCount] = await Promise.all([
      reviewRepository.findReviewsByMoverId(moverId, skip, limit),
      reviewRepository.countReviewsByMoverId(moverId),
    ]);

    return {
      reviews: reviews.map(mapMoverReview),
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  async getMyReviewList({ customerId, page, limit }: GetMyReviewListParams) {
    const skip = (page - 1) * limit;

    const [reviews, totalCount] = await Promise.all([
      reviewRepository.findMyReviewsByCustomerId(customerId, skip, limit),
      reviewRepository.countMyReviewsByCustomerId(customerId),
    ]);

    return {
      reviews: reviews.map(mapMyReview),
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  async getReviewableEstimateList({ customerId }: GetReviewableEstimateListParams) {
    const estimates = await reviewRepository.findReviewableEstimatesByCustomerId(customerId);

    return {
      reviewableEstimates: estimates.map(mapReviewableEstimate),
    };
  },

  async createReview({ customerId, estimateId, rating, content }: CreateReviewParams) {
    const estimate = await reviewRepository.findEstimateForReviewById(estimateId);

    if (!estimate) {
      throw new AppError("NOT_FOUND", {
        message: "견적을 찾을 수 없습니다.",
      });
    }

    assertReviewCreatable({
      customerId,
      estimateRequestCustomerId: estimate.estimateRequest.customerId,
      estimateStatus: estimate.status,
      estimateRequestStatus: estimate.estimateRequest.status,
      hasReview: estimate.review !== null,
      hasMoverProfile: estimate.mover.moverProfile !== null,
    });

    try {
      // 리뷰 생성과 기사님 리뷰 통계 갱신은 하나의 작성 유스케이스이므로 Service에서 트랜잭션 경계를 관리
      const result = await runTransaction(
        async (tx) => {
          const createdReview = await reviewRepository.createReview(
            {
              customerId,
              moverId: estimate.moverId,
              estimateId: estimate.id,
              rating,
              content,
            },
            tx,
          );

          const reviewStats = await reviewRepository.aggregateMoverReviewStats(
            estimate.moverId,
            tx,
          );
          const averageRating = reviewStats._avg.rating ?? 0;
          const roundedAverageRating = Math.round(averageRating * 10) / 10;

          await reviewRepository.updateMoverReviewStats(
            {
              moverId: estimate.moverId,
              averageRating: roundedAverageRating,
              reviewCount: reviewStats._count._all,
            },
            tx,
          );

          return createdReview;
        },
        {
          // 같은 기사님에게 여러 리뷰가 동시에 등록될 때 통계 재계산 결과가 덮어써지는 것을 방지
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      // 2026.08.03 정슬기 - [수정] 알림 실패가 리뷰 등록 성공 응답을 덮지 않도록 격리
      try {
        await notificationService.createNotification({
          userId: estimate.moverId,
          type: "REVIEW_RECEIVED",
          title: "리뷰 도착",
          content: "고객님이",
          //기사님이 리뷰를 확인할 수 있는 페이지가 아직 없음 → null 처리
          linkUrl: null,
          expiresAt: null,
        });
      } catch (notificationError) {
        logger.error("Failed to create REVIEW_RECEIVED notification.", {
          error: notificationError,
          reviewId: result.id,
          moverId: estimate.moverId,
        });
      }

      return {
        review: result,
      };
    } catch (error) {
      if (isReviewEstimateUniqueConstraintError(error)) {
        throw new AppError("CONFLICT", {
          message: "이미 리뷰를 작성한 견적입니다.",
        });
      }

      throw error;
    }
  },
};
