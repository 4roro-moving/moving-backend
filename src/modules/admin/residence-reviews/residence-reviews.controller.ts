import type { Request, Response } from "express";

import { AppError } from "../../../lib/app-error";

import { residenceReviewsService } from "./residence-reviews.service";
import type {
  HideResidenceReviewBody,
  ListAdminResidenceReviewsQuery,
  ResidenceReviewIdParam,
} from "./residence-reviews.type";

function getAdminId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const residenceReviewsController = {
  // GET /api/admin/residence-reviews
  getResidenceReviewList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListAdminResidenceReviewsQuery;
    const result = await residenceReviewsService.getResidenceReviewList(query);

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  },

  // POST /api/admin/residence-reviews/:residenceReviewId/hide
  hideResidenceReview: async (req: Request, res: Response) => {
    const { residenceReviewId } = res.locals.params as ResidenceReviewIdParam;
    const input = req.body as HideResidenceReviewBody;

    const item = await residenceReviewsService.hideResidenceReview({
      adminId: getAdminId(req),
      residenceReviewId,
      input,
    });

    res.status(200).json({
      success: true,
      message: "거주후기가 숨김 처리되었습니다.",
      data: item,
    });
  },

  // POST /api/admin/residence-reviews/:residenceReviewId/unhide
  unhideResidenceReview: async (req: Request, res: Response) => {
    const { residenceReviewId } = res.locals.params as ResidenceReviewIdParam;

    const item = await residenceReviewsService.unhideResidenceReview({
      adminId: getAdminId(req),
      residenceReviewId,
    });

    res.status(200).json({
      success: true,
      message: "거주후기가 복구되었습니다.",
      data: item,
    });
  },
};
