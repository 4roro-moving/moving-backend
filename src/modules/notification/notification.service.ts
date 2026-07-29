import { NotificationType } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { runTransaction } from "../../utils/transaction";

import { notificationRepository } from "./notification.repository";

import type {
  CreateNotificationInput,
  NotificationItem,
  NotificationListResponse,
  ReadAllNotificationsResponse,
  ReadNotificationResponse,
  UnreadNotificationCountResponse,
} from "./notification.type";

const CHAT_READ_VISIBILITY_DAYS = 3;
const NOTIFICATION_RETENTION_DAYS = 90;

/*
 * 전달받은 날짜를 기준으로 원하는 일수만큼 더하거나 뺀
 * 새로운 Date 객체를 반환한다.
 *
 * 원본 Date 객체는 직접 변경하지 않는다.
 *
 * 양수를 전달하면 날짜를 더하고,
 * 음수를 전달하면 날짜를 뺀다.
 */
const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
};

/*
 * 사용자의 유효한 알림 목록을 조회한다.
 *
 * 만료되지 않은 알림만 최신순으로 최대 5개 조회하는 조건은
 * Repository에서 처리한다.
 */
const getNotifications = async (userId: string): Promise<NotificationListResponse> => {
  const notifications = await notificationRepository.findManyByUserId(userId);

  return {
    notifications,
  };
};

/*
 * 사용자의 만료되지 않은 미읽음 알림 개수를 조회한다.
 *
 * expiresAt이 지난 알림은 Repository 조회 조건에서 제외된다.
 */
const getUnreadCount = async (userId: string): Promise<UnreadNotificationCountResponse> => {
  const unreadCount = await notificationRepository.countUnreadByUserId(userId);

  return {
    unreadCount,
  };
};

/*
 * 단일 알림을 읽음 처리한다.
 *
 * 본인의 알림인지 확인하고,
 * 만료된 알림은 읽음 처리하지 않는다.
 *
 * 채팅 알림은 읽은 시점부터 3일간 추가 노출하며,
 * 일반 알림은 기존 expiresAt을 유지한다.
 */
const readNotification = async (
  userId: string,
  notificationId: number,
): Promise<ReadNotificationResponse> => {
  const notification = await notificationRepository.findById(notificationId);

  /*
   * 요청한 ID에 해당하는 알림이 존재하지 않으면
   * NOT_FOUND 오류를 반환한다.
   */
  if (!notification) {
    throw new AppError("NOT_FOUND", {
      message: "알림을 찾을 수 없습니다.",
    });
  }

  /*
   * 요청한 사용자가 해당 알림의 소유자가 아니면
   * 읽음 처리할 수 없다.
   */
  if (notification.userId !== userId) {
    throw new AppError("FORBIDDEN", {
      message: "해당 알림에 접근할 권한이 없습니다.",
    });
  }

  const readAt = new Date();

  /*
   * 목록 조회에서는 만료된 알림이 제외되지만,
   * 사용자가 알림 ID를 직접 요청할 수 있으므로
   * Service에서도 만료 여부를 다시 확인한다.
   */
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

  /*
   * 읽음 여부와 읽은 시각을 갱신한다.
   *
   * 채팅 알림인 경우에만
   * 새로 계산한 expiresAt도 함께 갱신한다.
   */
  const updatedNotification = await notificationRepository.markAsRead(
    notificationId,
    readAt,
    expiresAt,
  );

  return {
    notification: updatedNotification,
  };
};

/*
 * 사용자의 유효한 미읽음 알림을 모두 읽음 처리한다.
 *
 * 채팅 알림은 읽은 시점부터 3일간 추가 노출해야 하므로
 * 일반 알림과 분리하여 처리한다.
 *
 * 채팅 알림과 일반 알림을 각각 updateMany로 처리하므로
 * 두 DB 변경을 하나의 트랜잭션으로 묶는다.
 */
const readAllNotifications = async (userId: string): Promise<ReadAllNotificationsResponse> => {
  const readAt = new Date();

  /*
   * 채팅 알림의 새로운 만료 시각을
   * 전체 읽음 처리 시각 기준 3일 후로 계산한다.
   */
  const chatExpiresAt = addDays(readAt, CHAT_READ_VISIBILITY_DAYS);

  /*
   * 채팅 알림과 일반 알림의 읽음 처리를
   * 하나의 트랜잭션 안에서 실행한다.
   */
  const updatedCount = await runTransaction(async (tx) => {
    return notificationRepository.markAllAsRead(userId, readAt, chatExpiresAt, tx);
  });

  return {
    updatedCount,
  };
};

/*
 * 다른 도메인 Service에서 알림을 생성할 때 사용하는 내부 함수다.
 *
 * Controller에서 직접 요청받아 생성하는 API 용도가 아니다.
 *
 * 견적, 리뷰, 신고 등의 도메인 Service에서
 * 알림 발생 시점에 이 함수를 호출한다.
 *
 * 추후 알림 생성 이후 해당 사용자에게
 * SSE 이벤트를 발행하는 로직을 연결할 수 있다.
 */
const createNotification = async (input: CreateNotificationInput): Promise<NotificationItem> => {
  return notificationRepository.create(input);
};

/*
 * 만료 후 보관 기간인 90일이 지난 알림을 영구 삭제한다.
 *
 * 현재 시각에서 90일을 뺀 시각을
 * 알림 삭제 기준 시각으로 계산한다.
 *
 * Repository에서는 expiresAt이 삭제 기준 시각보다 이전인
 * 알림만 일괄 삭제한다.
 *
 * expiresAt이 null인 무기한 알림은
 * Repository의 삭제 조건에 따라 자동 삭제 대상에서 제외된다.
 *
 * 이 함수는 추후 node-cron 배치 작업에서
 * 하루에 한 번 호출한다.
 */
const cleanupExpiredNotifications = async (): Promise<number> => {
  const deleteBefore = addDays(new Date(), -NOTIFICATION_RETENTION_DAYS);

  return notificationRepository.deleteExpiredNotifications(deleteBefore);
};

export const notificationService = {
  getNotifications,
  getUnreadCount,
  readNotification,
  readAllNotifications,
  createNotification,
  cleanupExpiredNotifications,
};
