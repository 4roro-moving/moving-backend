import type { NoticeAudience, NotificationType } from "@prisma/client";

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

/*
 * 특정 역할에 해당하는 모든 사용자에게
 * 동일한 알림을 일괄 생성할 때 사용한다.
 *
 * role이 ALL인 경우 CUSTOMER, MOVER에게만 발송하며
 * ADMIN은 알림 대상에서 제외한다.
 */
export interface CreateBulkNotificationInput {
  role: NoticeAudience;
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
