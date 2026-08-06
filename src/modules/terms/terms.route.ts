import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";
import { termsController } from "./terms.controller";
import {
  createTermsSchema,
  listTermsQuerySchema,
  termsIdParamSchema,
  termsTypeParamSchema,
  updateTermsSchema,
} from "./terms.validator";

/**
 * 관리자 약관 라우터 (/api/admin/terms)
 * 관리자만 접근 가능. 생성/목록/상세/수정/게시/삭제.
 */
const adminTermsRouter = Router();

adminTermsRouter.use(authenticate, authorize("ADMIN"));

adminTermsRouter
  .route("/")
  .post(validate({ body: createTermsSchema }), asyncHandler(termsController.createTerms))
  .get(validate({ query: listTermsQuerySchema }), asyncHandler(termsController.getTermsList));

adminTermsRouter
  .route("/:termsId")
  .get(validate({ params: termsIdParamSchema }), asyncHandler(termsController.getTermsById))
  .patch(
    validate({ params: termsIdParamSchema, body: updateTermsSchema }),
    asyncHandler(termsController.updateTerms),
  )
  .delete(validate({ params: termsIdParamSchema }), asyncHandler(termsController.deleteTerms));

adminTermsRouter.patch(
  "/:termsId/publish",
  validate({ params: termsIdParamSchema }),
  asyncHandler(termsController.publishTerms),
);

/**
 * 사용자 공개 약관 라우터 (/api/terms)
 * 인증 불필요. 각 유형의 현재 게시(PUBLISHED)된 약관만 조회.
 */
const publicTermsRouter = Router();

publicTermsRouter.get("/", asyncHandler(termsController.getPublishedList));

publicTermsRouter.get(
  "/:type",
  validate({ params: termsTypeParamSchema }),
  asyncHandler(termsController.getPublishedByType),
);

export { adminTermsRouter, publicTermsRouter };
