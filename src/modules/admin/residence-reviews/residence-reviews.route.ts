import { Router } from "express";

import { authenticate, authorize } from "../../../middlewares/auth";
import { validate } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler.util";

import { residenceReviewsController } from "./residence-reviews.controller";
import {
  hideResidenceReviewBodySchema,
  listAdminResidenceReviewsQuerySchema,
  residenceReviewIdParamSchema,
  unhideResidenceReviewBodySchema,
} from "./residence-reviews.validator";

/**
 * 관리자 콘텐츠 관리 — 거주후기
 * basePath: /api/admin/residence-reviews
 */
const adminResidenceReviewRouter = Router();

adminResidenceReviewRouter.use(authenticate, authorize("ADMIN"));

adminResidenceReviewRouter.get(
  "/",
  validate({ query: listAdminResidenceReviewsQuerySchema }),
  asyncHandler(residenceReviewsController.getResidenceReviewList),
);

adminResidenceReviewRouter.post(
  "/:residenceReviewId/hide",
  validate({ params: residenceReviewIdParamSchema, body: hideResidenceReviewBodySchema }),
  asyncHandler(residenceReviewsController.hideResidenceReview),
);

adminResidenceReviewRouter.post(
  "/:residenceReviewId/unhide",
  validate({ params: residenceReviewIdParamSchema, body: unhideResidenceReviewBodySchema }),
  asyncHandler(residenceReviewsController.unhideResidenceReview),
);

export { adminResidenceReviewRouter };
