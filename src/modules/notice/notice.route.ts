import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";

import { noticeController } from "./notice.controller";
import { listNoticeQuerySchema, noticeIdParamSchema } from "./notice.validator";

const noticeRouter = Router();

noticeRouter.use(authenticate, authorize("CUSTOMER", "MOVER"));

noticeRouter.get(
  "/",
  validate({ query: listNoticeQuerySchema }),
  asyncHandler(noticeController.getNoticeList),
);

noticeRouter.get(
  "/:noticeId",
  validate({ params: noticeIdParamSchema }),
  asyncHandler(noticeController.getNoticeById),
);

export default noticeRouter;
