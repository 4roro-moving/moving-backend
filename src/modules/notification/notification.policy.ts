import { NotificationType } from "@prisma/client";

import { AppError } from "../../lib/app-error";

import {
  CHAT_READ_VISIBILITY_DAYS,
  NOTIFICATION_RETENTION_DAYS,
  SUPPORTED_NOTICE_AUDIENCES,
} from "./notification.constants";

import type { CreateBulkNotificationInput, OwnedNotificationItem } from "./notification.type";

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
};

export const assertSupportedNoticeAudience = (role: CreateBulkNotificationInput["role"]): void => {
  const supportedRoles: readonly string[] = SUPPORTED_NOTICE_AUDIENCES;

  if (!supportedRoles.includes(role)) {
    throw new AppError("BAD_REQUEST", {
      message: "지원하지 않는 알림 대상입니다.",
    });
  }
};

export const normalizeBulkNotificationSourceId = (sourceId: string): string => {
  const normalizedSourceId = sourceId.trim();

  if (normalizedSourceId.length === 0) {
    throw new AppError("BAD_REQUEST", {
      message: "대량 알림 원본 식별자는 비어 있을 수 없습니다.",
    });
  }

  const separatorIndex = normalizedSourceId.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex === normalizedSourceId.length - 1) {
    throw new AppError("BAD_REQUEST", {
      message: "대량 알림 원본 식별자는 notice:{id}와 같은 형식이어야 합니다.",
    });
  }

  return normalizedSourceId;
};

export const assertValidBulkNotificationSnapshotAt = (snapshotAt: Date): void => {
  if (Number.isNaN(snapshotAt.getTime())) {
    throw new AppError("BAD_REQUEST", {
      message: "대량 알림 대상 기준 시각이 올바르지 않습니다.",
    });
  }
};

export const assertReadableNotification = (
  notification: OwnedNotificationItem | null,
  userId: string,
  readAt: Date,
): OwnedNotificationItem => {
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

  if (notification.expiresAt !== null && notification.expiresAt.getTime() <= readAt.getTime()) {
    throw new AppError("NOT_FOUND", {
      message: "알림을 찾을 수 없습니다.",
    });
  }

  return notification;
};

export const resolveReadExpiresAt = (type: NotificationType, readAt: Date): Date | undefined => {
  return type === NotificationType.CHAT_MESSAGE_RECEIVED
    ? addDays(readAt, CHAT_READ_VISIBILITY_DAYS)
    : undefined;
};

export const resolveReadAllChatExpiresAt = (readAt: Date): Date => {
  return addDays(readAt, CHAT_READ_VISIBILITY_DAYS);
};

export const resolveCleanupDeleteBefore = (now: Date): Date => {
  return addDays(now, -NOTIFICATION_RETENTION_DAYS);
};
