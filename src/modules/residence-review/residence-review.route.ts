import { UserRole } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";
import { residenceReviewController } from "./residence-review.controller";
import {
  createResidenceReviewSchema,
  listMyResidenceReviewQuerySchema,
  listResidenceReviewQuerySchema,
  residenceReviewIdParamSchema,
  updateResidenceReviewSchema,
} from "./residence-review.validator";

const customerAuth = [authenticate, authorize(UserRole.CUSTOMER)] as const;

/**
 * 공개 거주후기 라우터 (/api/residence-reviews)
 * 인증 없이 노출 중인(isHidden=false) 후기만 조회합니다.
 */
const publicResidenceReviewRouter = Router();

publicResidenceReviewRouter.get(
  "/",
  validate({ query: listResidenceReviewQuerySchema }),
  asyncHandler(residenceReviewController.getPublicResidenceReviewList),
);

publicResidenceReviewRouter.get(
  "/:residenceReviewId",
  validate({ params: residenceReviewIdParamSchema }),
  asyncHandler(residenceReviewController.getPublicResidenceReviewById),
);

/**
 * 고객 거주후기 라우터 (/api/residence-reviews)
 * 작성·수정·삭제와 내 후기 목록은 고객 본인만 가능합니다.
 */
const residenceReviewRouter = Router();

residenceReviewRouter.get(
  "/me",
  ...customerAuth,
  validate({ query: listMyResidenceReviewQuerySchema }),
  asyncHandler(residenceReviewController.getMyResidenceReviewList),
);

residenceReviewRouter.post(
  "/",
  ...customerAuth,
  validate({ body: createResidenceReviewSchema }),
  asyncHandler(residenceReviewController.createResidenceReview),
);

residenceReviewRouter.patch(
  "/:residenceReviewId",
  ...customerAuth,
  validate({ params: residenceReviewIdParamSchema, body: updateResidenceReviewSchema }),
  asyncHandler(residenceReviewController.updateResidenceReview),
);

residenceReviewRouter.delete(
  "/:residenceReviewId",
  ...customerAuth,
  validate({ params: residenceReviewIdParamSchema }),
  asyncHandler(residenceReviewController.deleteResidenceReview),
);

export { publicResidenceReviewRouter, residenceReviewRouter };
