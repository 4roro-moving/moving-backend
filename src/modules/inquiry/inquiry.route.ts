import { Router } from "express";

import { ADMIN_PERMISSIONS } from "../../lib/auth/admin-permissions";

import { requireActiveAdmin } from "../../middlewares/admin";
import { authorizeAdmin } from "../../middlewares/admin-auth";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";
import { adminInquiryController, inquiryController } from "./inquiry.controller";
import {
  adminListInquiryQuerySchema,
  createInquirySchema,
  createMessageSchema,
  inquiryIdParamSchema,
  listInquiryQuerySchema,
} from "./inquiry.validator";

/**
 * 사용자 문의 라우터 (/api/inquiries)
 * 로그인한 사용자가 본인 문의를 생성/조회/메시지/종료.
 */
const inquiryRouter = Router();

inquiryRouter.use(authenticate, authorize("CUSTOMER", "MOVER"));

inquiryRouter
  .route("/")
  .post(validate({ body: createInquirySchema }), asyncHandler(inquiryController.createInquiry))
  .get(
    validate({ query: listInquiryQuerySchema }),
    asyncHandler(inquiryController.getMyInquiryList),
  );

inquiryRouter.get(
  "/:inquiryId",
  validate({ params: inquiryIdParamSchema }),
  asyncHandler(inquiryController.getMyInquiryById),
);

inquiryRouter.post(
  "/:inquiryId/messages",
  validate({ params: inquiryIdParamSchema, body: createMessageSchema }),
  asyncHandler(inquiryController.addMessage),
);

inquiryRouter.patch(
  "/:inquiryId/close",
  validate({ params: inquiryIdParamSchema }),
  asyncHandler(inquiryController.closeInquiry),
);

/**
 * 관리자 문의 라우터 (/api/admin/inquiries)
 * 관리자가 전체 문의를 조회하고 답변/종료.
 */
const adminInquiryRouter = Router();

adminInquiryRouter.use(
  authenticate,
  requireActiveAdmin,
  authorizeAdmin(ADMIN_PERMISSIONS.INQUIRY_MANAGE),
);

adminInquiryRouter.get(
  "/",
  validate({ query: adminListInquiryQuerySchema }),
  asyncHandler(adminInquiryController.getInquiryList),
);

adminInquiryRouter.get(
  "/:inquiryId",
  validate({ params: inquiryIdParamSchema }),
  asyncHandler(adminInquiryController.getInquiryById),
);

adminInquiryRouter.post(
  "/:inquiryId/answer",
  validate({ params: inquiryIdParamSchema, body: createMessageSchema }),
  asyncHandler(adminInquiryController.answer),
);

adminInquiryRouter.patch(
  "/:inquiryId/close",
  validate({ params: inquiryIdParamSchema }),
  asyncHandler(adminInquiryController.closeInquiry),
);

export { adminInquiryRouter, inquiryRouter };
