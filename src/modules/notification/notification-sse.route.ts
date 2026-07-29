import { Router } from "express";

import { authenticate } from "../../middlewares/auth";
import { asyncHandler } from "../../utils/async-handler.util";

import { notificationSseController } from "./notification-sse.controller";

const notificationSseRouter = Router();

/*
 * SSE 연결을 시작한다.
 */
notificationSseRouter.get(
  "/subscribe",
  authenticate,
  asyncHandler(notificationSseController.subscribe),
);

export default notificationSseRouter;
