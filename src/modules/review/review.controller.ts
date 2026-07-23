import type { Request, RequestHandler } from "express";

import { AppError } from "../../lib/app-error";
import { reviewService } from "../../services/review.service";
import type { CreateReviewInput, ListMyReviewQuery } from "../../validators/review.validator";

function getCustomerId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const reviewController = {
  /**
   * GET /api/reviews/me
   *
   * 현재 로그인한 고객이 작성한 리뷰 목록을 페이지네이션으로 조회
   */
  getMyReviewList: (async (req, res, next) => {
    try {
      const query = res.locals.query as ListMyReviewQuery;
      const result = await reviewService.getMyReviewList({
        customerId: getCustomerId(req),
        page: query.page,
        limit: query.limit,
      });

      res.status(200).json({
        success: true,
        data: result.reviews,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  /**
   * GET /api/reviews/reviewable
   *
   * 현재 로그인한 고객이 리뷰를 작성할 수 있는 확정/완료 견적 목록을 조회한다.
   */
  getReviewableEstimateList: (async (req, res, next) => {
    try {
      const result = await reviewService.getReviewableEstimateList({
        customerId: getCustomerId(req),
      });

      res.status(200).json({
        success: true,
        data: result.reviewableEstimates,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  /**
   * POST /api/reviews
   *
   * 현재 로그인한 고객이 본인의 확정/완료 견적에 리뷰를 작성한다.
   */
  createReview: (async (req, res, next) => {
    try {
      const { estimateId, rating, content } = req.body as CreateReviewInput;

      const result = await reviewService.createReview({
        customerId: getCustomerId(req),
        estimateId,
        rating,
        content,
      });

      res.status(201).json({
        success: true,
        data: result.review,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,
};
