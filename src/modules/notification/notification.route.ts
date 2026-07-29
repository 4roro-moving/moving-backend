import { Router } from "express";

import { authenticate } from "../../middlewares/auth";
import { asyncHandler } from "../../utils/async-handler.util";
import { validate } from "../../middlewares/validate";

import { notificationController } from "./notification.controller";
import { notificationIdParamSchema } from "./notification.validator";

export const notificationRouter = Router();

notificationRouter.get("/", authenticate, asyncHandler(notificationController.getNotifications));

notificationRouter.get(
  "/unread-count",
  authenticate,
  asyncHandler(notificationController.getUnreadCount),
);

notificationRouter.patch(
  "/:notificationId/read",
  authenticate,
  validate({
    params: notificationIdParamSchema,
  }),
  asyncHandler(notificationController.readNotification),
);

notificationRouter.patch(
  "/read-all",
  authenticate,
  asyncHandler(notificationController.readAllNotifications),
);
