import { Router } from "express";

import { ADMIN_PERMISSIONS } from "../../../lib/auth/admin-permissions";

import { requireActiveAdmin } from "../../../middlewares/admin";
import { authorizeAdmin } from "../../../middlewares/admin-auth";
import { authenticate, authorize } from "../../../middlewares/auth";
import { validate } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler.util";

import { contentsController } from "./contents.controller";
import {
  hideContentBodySchema,
  listAdminReviewsQuerySchema,
  reviewIdParamSchema,
  unhideContentBodySchema,
} from "./contents.validator";

/**
 * 관리자 콘텐츠 관리 — 서비스 리뷰
 * basePath: /api/admin/reviews
 */
const adminReviewRouter = Router();

adminReviewRouter.use(
  authenticate,
  authorize("ADMIN"),
  requireActiveAdmin,
  authorizeAdmin(ADMIN_PERMISSIONS.REVIEW_MANAGE),
);

adminReviewRouter.get(
  "/",
  validate({ query: listAdminReviewsQuerySchema }),
  asyncHandler(contentsController.getReviewList),
);

adminReviewRouter.post(
  "/:reviewId/hide",
  validate({ params: reviewIdParamSchema, body: hideContentBodySchema }),
  asyncHandler(contentsController.hideReview),
);

adminReviewRouter.post(
  "/:reviewId/unhide",
  validate({ params: reviewIdParamSchema, body: unhideContentBodySchema }),
  asyncHandler(contentsController.unhideReview),
);

export { adminReviewRouter };
