import { Router } from "express";

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
  .post(validate({ body: createNoticeSchema }), noticeController.createNotice)
  .get(validate({ query: listNoticeQuerySchema }), noticeController.getNoticeList);

noticeRouter
  .route("/:noticeId")
  .get(validate({ params: noticeIdParamSchema }), noticeController.getNoticeById)
  .patch(
    validate({ params: noticeIdParamSchema, body: updateNoticeSchema }),
    noticeController.updateNotice,
  )
  .delete(validate({ params: noticeIdParamSchema }), noticeController.deleteNotice);

export default noticeRouter;
