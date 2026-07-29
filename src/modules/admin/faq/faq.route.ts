import { Router } from "express";

import { authenticate, authorize } from "../../../middlewares/auth";
import { validate } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler.util";
import { faqController } from "./faq.controller";
import {
  createFaqSchema,
  faqIdParamSchema,
  listFaqQuerySchema,
  updateFaqSchema,
} from "./faq.validator";

/**
 * 관리자 FAQ 라우터 (/api/admin/faqs)
 * 관리자만 접근 가능. 생성/목록/상세/수정/삭제.
 */
const adminFaqRouter = Router();

adminFaqRouter.use(authenticate, authorize("ADMIN"));

adminFaqRouter
  .route("/")
  .post(validate({ body: createFaqSchema }), asyncHandler(faqController.createFaq))
  .get(validate({ query: listFaqQuerySchema }), asyncHandler(faqController.getFaqList));

adminFaqRouter
  .route("/:faqId")
  .get(validate({ params: faqIdParamSchema }), asyncHandler(faqController.getFaqById))
  .patch(
    validate({ params: faqIdParamSchema, body: updateFaqSchema }),
    asyncHandler(faqController.updateFaq),
  )
  .delete(validate({ params: faqIdParamSchema }), asyncHandler(faqController.deleteFaq));

/**
 * 사용자 공개 FAQ 라우터 (/api/faqs)
 * 인증 불필요. 공개(isVisible=true) FAQ만 조회.
 */
const publicFaqRouter = Router();

publicFaqRouter.get("/", asyncHandler(faqController.getPublicFaqList));

export { adminFaqRouter, publicFaqRouter };
