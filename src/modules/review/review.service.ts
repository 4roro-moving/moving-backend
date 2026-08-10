import { EstimateRequestStatus, EstimateStatus, Prisma } from "@prisma/client";

import logger from "../../config/logger";
import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";
import { runTransaction } from "../../utils/transaction";
import { notificationService } from "../notification/notification.service";
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

// 리뷰 작성자 이메일 로컬 파트 마스킹
function maskEmailLocalPart(email: string) {
  const localPart = email.split("@")[0] ?? "";

  if (localPart.length <= 1) {
    return `${localPart}*`;
  }

  if (localPart.length === 2) {
    return `${localPart[0]}*`;
  }

  return `${localPart.slice(0, 2)}${"*".repeat(localPart.length - 2)}`;
}

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
      reviews: reviews.map((review) => {
        const estimateRequest = review.estimate.estimateRequest;

        return {
          id: review.id,
          rating: review.rating,
          content: review.content,
          createdAt: review.createdAt,
          customer: {
            id: review.customer.id,
            displayName: maskEmailLocalPart(review.customer.email),
            imageUrl: review.customer.customerProfile?.imageUrl ?? null,
          },
          estimateRequest: {
            id: estimateRequest.id,
            moveType: estimateRequest.moveType,
            moveDate: estimateRequest.moveDate,
          },
        };
      }),
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
      reviews: reviews.map((review) => {
        const moverProfile = review.mover.moverProfile;
        const estimateRequest = review.estimate.estimateRequest;

        return {
          id: review.id,
          estimateId: review.estimateId,
          rating: review.rating,
          content: review.content,
          createdAt: review.createdAt,
          price: review.estimate.price,
          estimateRequest: {
            id: estimateRequest.id,
            moveType: estimateRequest.moveType,
            moveDate: estimateRequest.moveDate,
            fromAddress: estimateRequest.fromAddress,
            toAddress: estimateRequest.toAddress,
          },
          mover: {
            id: review.mover.id,
            name: review.mover.name,
            nickname: moverProfile?.nickname ?? null,
            imageUrl: moverProfile?.imageUrl ?? null,
            shortIntro: moverProfile?.shortIntro ?? null,
          },
        };
      }),
      pagination: buildPagination(totalCount, page, limit),
    };
  },

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
