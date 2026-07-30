import type { NotificationType } from "@prisma/client";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  linkUrl?: string | null;

  /*
   * 알림 생성 시 만료 정책을 반드시 명시한다.
   *
   * 만료되는 알림은 실제 만료 시각을 전달하고,
   * 무기한 알림만 명시적으로 null을 전달한다.
   */
  expiresAt: Date | null;
}

export interface NotificationItem {
  id: number;
  type: NotificationType;
  title: string;
  content: string;
  linkUrl: string | null;
  isRead: boolean;
  readAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/*
 * 알림 목록 조회 시 사용하는 페이지네이션 정보를 정의한다.
 */
export interface NotificationPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
}

/*
 * 알림 목록과 페이지네이션 정보를 함께 반환한다.
 */
export interface NotificationListResponse {
  notifications: NotificationItem[];
  pagination: NotificationPagination;
}

export interface UnreadNotificationCountResponse {
  unreadCount: number;
}

export interface ReadNotificationResponse {
  notification: NotificationItem;
}

export interface ReadAllNotificationsResponse {
  updatedCount: number;
}
