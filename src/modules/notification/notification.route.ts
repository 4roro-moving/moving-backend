import { Router } from "express";

import { authenticate } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";

import { notificationController } from "./notification.controller";
import { notificationIdParamSchema } from "./notification.validator";

export const notificationRouter = Router();

// 알림 목록 조회
notificationRouter.get("/", authenticate, asyncHandler(notificationController.getNotifications));

// 읽지 않은 알림 개수 조회
notificationRouter.get(
  "/unread-count",
  authenticate,
  asyncHandler(notificationController.getUnreadCount),
);

// 모든 알림 읽음 처리
notificationRouter.patch(
  "/read-all",
  authenticate,
  asyncHandler(notificationController.readAllNotifications),
);

// 단일 알림 읽음 처리
notificationRouter.patch(
  "/:notificationId/read",
  authenticate,
  validate({
    params: notificationIdParamSchema,
  }),
  asyncHandler(notificationController.readNotification),
);
