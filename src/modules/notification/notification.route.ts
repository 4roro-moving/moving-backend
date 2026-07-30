import { Router } from "express";

import { authenticate } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";

import { notificationController } from "./notification.controller";
import { notificationIdParamSchema, notificationListQuerySchema } from "./notification.validator";

export const notificationRouter = Router();

/*
 * 현재 로그인한 사용자의 알림 목록을 페이지 단위로 조회한다.
 *
 * page와 limit Query String을 검증한 뒤
 * 변환된 값을 res.locals.query에 저장한다.
 */
notificationRouter.get(
  "/",
  authenticate,
  validate({
    query: notificationListQuerySchema,
  }),
  asyncHandler(notificationController.getNotifications),
);

/*
 * 현재 로그인한 사용자의
 * 유효한 미읽음 알림 개수를 조회한다.
 */
notificationRouter.get(
  "/unread-count",
  authenticate,
  asyncHandler(notificationController.getUnreadCount),
);

/*
 * 현재 로그인한 사용자의
 * 유효한 미읽음 알림을 모두 읽음 처리한다.
 */
notificationRouter.patch(
  "/read-all",
  authenticate,
  asyncHandler(notificationController.readAllNotifications),
);

/*
 * 알림 ID를 검증한 뒤
 * 현재 로그인한 사용자의 단일 알림을 읽음 처리한다.
 *
 * 검증된 notificationId는
 * res.locals.params에 저장된다.
 */
notificationRouter.patch(
  "/:notificationId/read",
  authenticate,
  validate({
    params: notificationIdParamSchema,
  }),
  asyncHandler(notificationController.readNotification),
);
