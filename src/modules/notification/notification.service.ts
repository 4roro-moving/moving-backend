import { NotificationType } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { runTransaction } from "../../utils/transaction";

import { notificationRepository } from "./notification.repository";
import { notificationSseService } from "./notification-sse.service";

import type {
  CreateBulkNotificationInput,
  CreateNotificationInput,
  NotificationItem,
  NotificationListResponse,
  ReadAllNotificationsResponse,
  ReadNotificationResponse,
  UnreadNotificationCountResponse,
} from "./notification.type";

/*
 * notificationRepository.create()의 두 번째 인자인
 * Prisma Client 또는 Transaction Client 타입을 가져온다.
 *
 * 별도의 DbClient import 경로에 의존하지 않기 위해
 * Repository 메서드의 매개변수 타입에서 추출한다.
 */
type NotificationDbClient = Parameters<typeof notificationRepository.create>[1];

const CHAT_READ_VISIBILITY_DAYS = 3;
const NOTIFICATION_RETENTION_DAYS = 90;
const BULK_NOTIFICATION_BATCH_SIZE = 500;

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
 * 만료되지 않은 알림만 최신순으로 조회하는 조건은
 * Repository에서 처리한다.
 */
const getNotifications = async (
  userId: string,
  page: number,
  limit: number,
): Promise<NotificationListResponse> => {
  const skip = (page - 1) * limit;

  const { notifications, totalCount } = await notificationRepository.findManyByUserId({
    userId,
    skip,
    take: limit,
  });

  const totalPages = Math.ceil(totalCount / limit);

  return {
    notifications,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
    },
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

  if (notification.isRead) {
    const { userId: _, ...notificationItem } = notification;

    return {
      notification: notificationItem,
    };
  }

  const expiresAt =
    notification.type === NotificationType.CHAT_MESSAGE_RECEIVED
      ? addDays(readAt, CHAT_READ_VISIBILITY_DAYS)
      : undefined;

  const updatedNotification = await notificationRepository.markAsRead(
    notificationId,
    userId,
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

  const chatExpiresAt = addDays(readAt, CHAT_READ_VISIBILITY_DAYS);

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
 * 견적, 리뷰, 신고 등의 핵심 DB 작업과 같은 트랜잭션에
 * 알림 저장을 포함할 수 있도록 db 인자를 전달받는다.
 *
 * 이 함수는 알림을 DB에 저장하는 역할만 담당하며,
 * SSE 전송은 수행하지 않는다.
 *
 * 전달된 db가 Transaction Client인 경우
 * 핵심 작업과 알림 저장이 함께 커밋되거나 롤백된다.
 */
const createNotification = async (
  input: CreateNotificationInput,
  db?: NotificationDbClient,
): Promise<NotificationItem> => {
  return notificationRepository.create(input, db);
};

/*
 * 역할에 해당하는 활성 사용자에게
 * 동일한 알림을 일정 개수씩 나누어 생성한다.
 *
 * 전체 사용자 ID를 한 번에 조회하지 않고,
 * 마지막으로 조회한 사용자 ID를 cursor로 사용하여
 * BULK_NOTIFICATION_BATCH_SIZE만큼 반복 조회한다.
 *
 * 각 배치에서는 Prisma createMany를 사용하여
 * 사용자별 알림을 한 번에 저장한다.
 *
 * 해당 배치의 DB 저장이 성공한 이후에는
 * 현재 SSE에 연결된 대상 사용자에게
 * notification-refresh 이벤트를 전송한다.
 *
 * 각 배치는 별도의 DB 작업으로 처리되므로,
 * 중간 배치에서 실패하면 이미 완료된 이전 배치는 유지될 수 있다.
 *
 * 현재는 중복 방지를 위한 원본 식별자와 복합 unique 제약이 없으므로,
 * 실패 후 전체 작업을 재실행하면 일부 알림이 중복 생성될 수 있다.
 *
 * 반환값은 실제로 생성된 전체 알림 개수이다.
 */
const createBulkNotification = async (input: CreateBulkNotificationInput): Promise<number> => {
  let cursorId: string | undefined;
  let createdCount = 0;

  while (true) {
    const recipientIds = await notificationRepository.findRecipientIdsByRole({
      role: input.role,
      take: BULK_NOTIFICATION_BATCH_SIZE,
      ...(cursorId !== undefined && {
        cursorId,
      }),
    });

    if (recipientIds.length === 0) {
      break;
    }

    const notifications: CreateNotificationInput[] = recipientIds.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      content: input.content,
      expiresAt: input.expiresAt,
      ...(input.linkUrl !== undefined && {
        linkUrl: input.linkUrl,
      }),
    }));

    const batchCreatedCount = await notificationRepository.createMany(notifications);

    createdCount += batchCreatedCount;

    /*
     * 해당 배치의 알림 저장이 성공한 이후에만
     * 현재 SSE에 연결된 대상 사용자에게
     * 알림 목록 갱신 이벤트를 전송한다.
     */
    notificationSseService.sendNotificationRefresh(recipientIds);

    const lastRecipientId = recipientIds[recipientIds.length - 1];

    if (lastRecipientId === undefined) {
      break;
    }

    cursorId = lastRecipientId;

    /*
     * 조회된 사용자 수가 배치 크기보다 작으면
     * 마지막 배치이므로 다음 조회 없이 종료한다.
     */
    if (recipientIds.length < BULK_NOTIFICATION_BATCH_SIZE) {
      break;
    }
  }

  return createdCount;
};

/*
 * DB에 저장된 알림을 SSE로 실시간 전송한다.
 *
 * 트랜잭션 내부에서 호출하지 않고,
 * 핵심 작업과 알림 저장이 모두 커밋된 이후에 호출한다.
 *
 * 사용자가 SSE에 연결되어 있지 않더라도
 * 이미 저장된 알림 데이터에는 영향을 주지 않는다.
 */
const sendNotification = (userId: string, notification: NotificationItem): void => {
  notificationSseService.sendNotification(userId, notification);
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
 * 이 함수는 node-cron 배치 작업에서
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
  createBulkNotification,
  sendNotification,
  cleanupExpiredNotifications,
};
