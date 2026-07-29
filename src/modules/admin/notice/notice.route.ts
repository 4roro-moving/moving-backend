import { Router } from "express";
import { asyncHandler } from "../../../utils/async-handler.util";
import { authenticate, authorize } from "../../../middlewares/auth";
import { validate } from "../../../middlewares/validate";
import { noticeController } from "./notice.controller";
import {
  createNoticeSchema,
  listNoticeQuerySchema,
  noticeIdParamSchema,
  updateNoticeSchema,
} from "./notice.validator";

const noticeRouter = Router();

// 공지 관리는 관리자만 접근할 수 있습니다.
noticeRouter.use(authenticate, authorize("ADMIN"));

noticeRouter
  .route("/")
  .post(validate({ body: createNoticeSchema }), asyncHandler(noticeController.createNotice))
  .get(validate({ query: listNoticeQuerySchema }), asyncHandler(noticeController.getNoticeList));

noticeRouter
  .route("/:noticeId")
  .get(validate({ params: noticeIdParamSchema }), asyncHandler(noticeController.getNoticeById))
  .patch(
    validate({ params: noticeIdParamSchema, body: updateNoticeSchema }),
    asyncHandler(noticeController.updateNotice),
  )
  .delete(validate({ params: noticeIdParamSchema }), asyncHandler(noticeController.deleteNotice));

export default noticeRouter;
