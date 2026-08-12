import type {
  NotificationItem,
  NotificationListResponse,
  OwnedNotificationItem,
  ReadAllNotificationsResponse,
  ReadNotificationResponse,
  UnreadNotificationCountResponse,
} from "./notification.type";

const buildNotificationPagination = (page: number, limit: number, totalCount: number) => {
  const totalPages = Math.ceil(totalCount / limit);

  return {
    page,
    limit,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
  };
};

export const mapNotificationListResponse = (
  notifications: NotificationItem[],
  page: number,
  limit: number,
  totalCount: number,
): NotificationListResponse => {
  return {
    notifications,
    pagination: buildNotificationPagination(page, limit, totalCount),
  };
};

export const mapOwnedNotificationToItem = (
  notification: OwnedNotificationItem,
): NotificationItem => {
  const { userId: _userId, ...notificationItem } = notification;

  return notificationItem;
};

export const mapUnreadNotificationCountResponse = (
  unreadCount: number,
): UnreadNotificationCountResponse => {
  return {
    unreadCount,
  };
};

export const mapReadNotificationResponse = (
  notification: NotificationItem,
): ReadNotificationResponse => {
  return {
    notification,
  };
};

export const mapReadAllNotificationsResponse = (
  updatedCount: number,
): ReadAllNotificationsResponse => {
  return {
    updatedCount,
  };
};
