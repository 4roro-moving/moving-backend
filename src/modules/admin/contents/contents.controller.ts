import type { Request, Response } from "express";

import { getAuthenticatedUserId } from "../../../utils/request-auth.util";

import { contentsService } from "./contents.service";
import type {
  HideContentBody,
  ListAdminReviewsQuery,
  ReviewIdParam,
  UnhideContentBody,
} from "./contents.type";

export const contentsController = {
  // GET /api/admin/reviews
  getReviewList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListAdminReviewsQuery;
    const result = await contentsService.getReviewList(query);

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  },

  // POST /api/admin/reviews/:reviewId/hide
  hideReview: async (req: Request, res: Response) => {
    const { reviewId } = res.locals.params as ReviewIdParam;
    const input = req.body as HideContentBody;

    const review = await contentsService.hideReview({
      adminId: getAuthenticatedUserId(req),
      reviewId,
      input,
    });

    res.status(200).json({
      success: true,
      message: "리뷰가 숨김 처리되었습니다.",
      data: review,
    });
  },

  // POST /api/admin/reviews/:reviewId/unhide
  unhideReview: async (req: Request, res: Response) => {
    const { reviewId } = res.locals.params as ReviewIdParam;
    const input = req.body as UnhideContentBody;

    const review = await contentsService.unhideReview({
      adminId: getAuthenticatedUserId(req),
      reviewId,
      input,
    });

    res.status(200).json({
      success: true,
      message: "리뷰가 복구되었습니다.",
      data: review,
    });
  },
};
