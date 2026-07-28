import { NotificationType } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { runTransaction } from "../../utils/transaction";

import { notificationRepository } from "./notification.repository";

import type {
  CreateNotificationInput,
  NotificationListResponse,
  ReadAllNotificationsResponse,
  ReadNotificationResponse,
  UnreadNotificationCountResponse,
} from "./notification.type";

const CHAT_READ_VISIBILITY_DAYS = 3;

const getNotifications = async (userId: string): Promise<NotificationListResponse> => {
  const notifications = await notificationRepository.findManyByUserId(userId);

  return {
    notifications,
  };
};

const getUnreadCount = async (userId: string): Promise<UnreadNotificationCountResponse> => {
  const unreadCount = await notificationRepository.countUnreadByUserId(userId);

  return {
    unreadCount,
  };
};

const readNotification = async (
  userId: string,
  notificationId: number,
): Promise<ReadNotificationResponse> => {
  const notification = await notificationRepository.findById(notificationId);

  if (!notification) {
    throw new AppError("NOT_FOUND", {
      message: "알림을 찾을 수 없습니다.",
    });
  }

  if (notification.userId !== userId) {
    throw new AppError("FORBIDDEN", {
      message: "해당 알림에 접근할 권한이 없습니다.",
    });
  }

  const readAt = new Date();

  if (notification.expiresAt !== null && notification.expiresAt.getTime() <= readAt.getTime()) {
    throw new AppError("NOT_FOUND", {
      message: "알림을 찾을 수 없습니다.",
    });
  }

  /*
   * 이미 읽은 알림은 readAt과 expiresAt을 다시 갱신하지 않는다.
   *
   * 채팅 알림을 반복해서 클릭할 때마다
   * 노출 기간이 계속 연장되는 것을 방지한다.
   */
  if (notification.isRead) {
    const { userId: _, ...notificationItem } = notification;

    return {
      notification: notificationItem,
    };
  }

  /*
   * 채팅 알림은 읽은 시점부터 3일간 추가 노출한다.
   *
   * 일반 알림은 기존 expiresAt을 유지하므로
   * undefined를 전달한다.
   */
  const expiresAt =
    notification.type === NotificationType.CHAT_MESSAGE_RECEIVED
      ? addDays(readAt, CHAT_READ_VISIBILITY_DAYS)
      : undefined;

  const updatedNotification = await notificationRepository.markAsRead(
    notificationId,
    readAt,
    expiresAt,
  );

  return {
    notification: updatedNotification,
  };
};

const readAllNotifications = async (userId: string): Promise<ReadAllNotificationsResponse> => {
  const readAt = new Date();

  const chatExpiresAt = addDays(readAt, CHAT_READ_VISIBILITY_DAYS);

  /*
   * Repository에서 채팅 알림과 일반 알림을
   * 각각 updateMany로 갱신하므로 하나의 트랜잭션으로 처리한다.
   */
  const updatedCount = await runTransaction(async (tx) => {
    return notificationRepository.markAllAsRead(userId, readAt, chatExpiresAt, tx);
  });

  return {
    updatedCount,
  };
};

/*
 * 다른 도메인 Service에서 알림을 생성할 때 사용하는 내부 함수.
 *
 * Controller에서 직접 요청받아 생성하는 API 용도가 아니다.
 */
const createNotification = async (input: CreateNotificationInput) => {
  return notificationRepository.create(input);
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
};

export const notificationService = {
  getNotifications,
  getUnreadCount,
  readNotification,
  readAllNotifications,
  createNotification,
};
