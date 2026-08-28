import { runTransaction } from "../../utils/transaction";

import { BULK_NOTIFICATION_BATCH_SIZE } from "./notification.constants";
import {
  mapNotificationListResponse,
  mapOwnedNotificationToItem,
  mapReadAllNotificationsResponse,
  mapReadNotificationResponse,
  mapUnreadNotificationCountResponse,
} from "./notification.mapper";
import {
  assertReadableNotification,
  assertSupportedNoticeAudience,
  assertValidBulkNotificationSnapshotAt,
  normalizeBulkNotificationSourceId,
  resolveCleanupDeleteBefore,
  resolveReadAllChatExpiresAt,
  resolveReadExpiresAt,
} from "./notification.policy";
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

type NotificationDbClient = Parameters<typeof notificationRepository.create>[1];

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

  return mapNotificationListResponse(notifications, page, limit, totalCount);
};

const getUnreadCount = async (userId: string): Promise<UnreadNotificationCountResponse> => {
  const unreadCount = await notificationRepository.countUnreadByUserId(userId);

  return mapUnreadNotificationCountResponse(unreadCount);
};

const readNotification = async (
  userId: string,
  notificationId: number,
): Promise<ReadNotificationResponse> => {
  const readAt = new Date();
  const notification = assertReadableNotification(
    await notificationRepository.findById(notificationId),
    userId,
    readAt,
  );

  if (notification.isRead) {
    return mapReadNotificationResponse(mapOwnedNotificationToItem(notification));
  }

  const updatedNotification = await notificationRepository.markAsRead(
    notificationId,
    userId,
    readAt,
    resolveReadExpiresAt(notification.type, readAt),
  );

  return mapReadNotificationResponse(updatedNotification);
};

const readAllNotifications = async (userId: string): Promise<ReadAllNotificationsResponse> => {
  const readAt = new Date();
  const chatExpiresAt = resolveReadAllChatExpiresAt(readAt);

  const updatedCount = await runTransaction(async (tx) => {
    return notificationRepository.markAllAsRead(userId, readAt, chatExpiresAt, tx);
  });

  return mapReadAllNotificationsResponse(updatedCount);
};

const createNotification = async (
  input: CreateNotificationInput,
  db?: NotificationDbClient,
): Promise<NotificationItem> => {
  return notificationRepository.create(input, db);
};

const createBulkNotification = async (input: CreateBulkNotificationInput): Promise<number> => {
  assertSupportedNoticeAudience(input.role);
  assertValidBulkNotificationSnapshotAt(input.snapshotAt);

  const sourceId = normalizeBulkNotificationSourceId(input.sourceId);

  let cursorId: string | undefined;
  let createdCount = 0;

  while (true) {
    const recipientIds = await notificationRepository.findRecipientIdsByRole({
      role: input.role,
      take: BULK_NOTIFICATION_BATCH_SIZE,
      snapshotAt: input.snapshotAt,
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
      sourceId,
      expiresAt: input.expiresAt,
      ...(input.linkUrl !== undefined && {
        linkUrl: input.linkUrl,
      }),
    }));

    const batchCreatedCount = await notificationRepository.createMany(notifications);

    createdCount += batchCreatedCount;

    if (batchCreatedCount > 0) {
      notificationSseService.sendNotificationRefresh(recipientIds);
    }

    const lastRecipientId = recipientIds[recipientIds.length - 1];

    if (lastRecipientId === undefined) {
      break;
    }

    cursorId = lastRecipientId;

    if (recipientIds.length < BULK_NOTIFICATION_BATCH_SIZE) {
      break;
    }
  }

  return createdCount;
};

const sendNotification = (userId: string, notification: NotificationItem): void => {
  notificationSseService.sendNotification(userId, notification);
};

const cleanupExpiredNotifications = async (): Promise<number> => {
  const deleteBefore = resolveCleanupDeleteBefore(new Date());

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
