import type { RequestHandler } from "express";

import { AppError } from "../../lib/app-error";

import { notificationService } from "./notification.service";

import type { NotificationIdParam, NotificationListQuery } from "./notification.validator";

/*
 * 현재 로그인한 사용자의 알림 목록을 조회한다.
 *
 * validate 미들웨어에서 검증된 page와 limit을
 * res.locals.query에서 조회하여 Service로 전달한다.
 */
const getNotifications: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  const { page, limit } = res.locals.query as NotificationListQuery;

  const data = await notificationService.getNotifications(req.user.id, page, limit);

  res.status(200).json({
    success: true,
    message: "알림 목록을 조회했습니다.",
    data,
  });
};

/*
 * 현재 로그인한 사용자의
 * 읽지 않은 알림 개수를 조회한다.
 */
const getUnreadCount: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  const data = await notificationService.getUnreadCount(req.user.id);

  res.status(200).json({
    success: true,
    message: "읽지 않은 알림 개수를 조회했습니다.",
    data,
  });
};

/*
 * 현재 로그인한 사용자의
 * 단일 알림을 읽음 처리한다.
 *
 * validate 미들웨어에서 검증된 notificationId를
 * res.locals.params에서 조회하여 Service로 전달한다.
 */
const readNotification: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  const { notificationId } = res.locals.params as NotificationIdParam;

  const data = await notificationService.readNotification(req.user.id, notificationId);

  res.status(200).json({
    success: true,
    message: "알림을 읽음 처리했습니다.",
    data,
  });
};

/*
 * 현재 로그인한 사용자의
 * 모든 미읽음 알림을 읽음 처리한다.
 */
const readAllNotifications: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  const data = await notificationService.readAllNotifications(req.user.id);

  res.status(200).json({
    success: true,
    message: "모든 알림을 읽음 처리했습니다.",
    data,
  });
};

export const notificationController = {
  getNotifications,
  getUnreadCount,
  readNotification,
  readAllNotifications,
};
