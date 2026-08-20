import { UserRole } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorize, optionalAuthenticate } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";
import { residenceReviewController } from "./residence-review.controller";
import {
  createResidenceReviewSchema,
  listMyResidenceReviewQuerySchema,
  listResidenceReviewQuerySchema,
  regionIdParamSchema,
  residenceReviewIdParamSchema,
  updateResidenceReviewSchema,
} from "./residence-review.validator";

const customerAuth = [authenticate, authorize(UserRole.CUSTOMER)] as const;

/**
 * 공개 거주후기 라우터 (/api/residence-reviews)
 * 비회원도 노출 중인(isHidden=false) 후기를 조회할 수 있습니다.
 * 목록·상세는 로그인 시 isMine을 내려주기 위해 optionalAuthenticate를 사용합니다.
 */
const publicResidenceReviewRouter = Router();

publicResidenceReviewRouter.get(
  "/",
  optionalAuthenticate,
  validate({ query: listResidenceReviewQuerySchema }),
  asyncHandler(residenceReviewController.getPublicResidenceReviewList),
);

publicResidenceReviewRouter.get(
  "/statistics/:regionId",
  validate({ params: regionIdParamSchema }),
  asyncHandler(residenceReviewController.getRegionReviewStatistic),
);

publicResidenceReviewRouter.get(
  "/:residenceReviewId",
  optionalAuthenticate,
  validate({ params: residenceReviewIdParamSchema }),
  asyncHandler(residenceReviewController.getPublicResidenceReviewById),
);

/**
 * 고객 거주후기 라우터 (/api/residence-reviews)
 * 작성·수정·삭제와 내 후기 목록은 고객 본인만 가능합니다.
 */
const residenceReviewRouter = Router();

// 내 후기는 건수가 많지 않고 페이지 번호를 직접 지정하는 편이 맞아 offset 페이지네이션을 유지합니다.
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
