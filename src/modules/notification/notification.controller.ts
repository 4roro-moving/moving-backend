import type { RequestHandler } from "express";

import { AppError } from "../../lib/app-error";

import { notificationService } from "./notification.service";

const getNotifications: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  const data = await notificationService.getNotifications(req.user.id);

  res.status(200).json({
    success: true,
    message: "알림 목록을 조회했습니다.",
    data,
  });
};

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

const readNotification: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  const notificationId = Number(req.params.notificationId);

  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    throw new AppError("VALIDATION_ERROR", {
      message: "알림 ID가 올바르지 않습니다.",
    });
  }

  const data = await notificationService.readNotification(req.user.id, notificationId);

  res.status(200).json({
    success: true,
    message: "알림을 읽음 처리했습니다.",
    data,
  });
};

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
