import { NotificationType } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

import type { CreateNotificationInput } from "./notification.type";

const NOTIFICATION_LIST_LIMIT = 5;

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  content: true,
  linkUrl: true,
  isRead: true,
  readAt: true,
  expiresAt: true,
  createdAt: true,
} as const;

export const notificationRepository = {
  findManyByUserId,
  countUnreadByUserId,
  findById,
  markAsRead,
  markAllAsRead,
  create,
};

async function findManyByUserId(userId: string, db: DbClient = prisma) {
  const now = new Date();

  return db.notification.findMany({
    where: {
      userId,
      OR: [
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            gt: now,
          },
        },
      ],
    },
    select: notificationSelect,
    orderBy: {
      createdAt: "desc",
    },
    take: NOTIFICATION_LIST_LIMIT,
  });
}

async function countUnreadByUserId(userId: string, db: DbClient = prisma) {
  const now = new Date();

  return db.notification.count({
    where: {
      userId,
      isRead: false,
      OR: [
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            gt: now,
          },
        },
      ],
    },
  });
}

async function findById(notificationId: number, db: DbClient = prisma) {
  return db.notification.findUnique({
    where: {
      id: notificationId,
    },
    select: {
      ...notificationSelect,
      userId: true,
    },
  });
}

async function markAsRead(
  notificationId: number,
  readAt: Date,
  expiresAt: Date | undefined,
  db: DbClient = prisma,
) {
  return db.notification.update({
    where: {
      id: notificationId,
    },
    data: {
      isRead: true,
      readAt,
      ...(expiresAt !== undefined && {
        expiresAt,
      }),
    },
    select: notificationSelect,
  });
}

async function markAllAsRead(
  userId: string,
  readAt: Date,
  chatExpiresAt: Date,
  db: DbClient = prisma,
) {
  const unreadCondition = {
    userId,
    isRead: false,
    OR: [
      {
        expiresAt: null,
      },
      {
        expiresAt: {
          gt: readAt,
        },
      },
    ],
  };

  const chatResult = await db.notification.updateMany({
    where: {
      ...unreadCondition,
      type: NotificationType.CHAT_MESSAGE_RECEIVED,
    },
    data: {
      isRead: true,
      readAt,
      expiresAt: chatExpiresAt,
    },
  });

  const otherResult = await db.notification.updateMany({
    where: {
      ...unreadCondition,
      type: {
        not: NotificationType.CHAT_MESSAGE_RECEIVED,
      },
    },
    data: {
      isRead: true,
      readAt,
    },
  });

  return chatResult.count + otherResult.count;
}

async function create(input: CreateNotificationInput, db: DbClient = prisma) {
  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      content: input.content,
      linkUrl: input.linkUrl ?? null,
      expiresAt: input.expiresAt ?? null,
    },
    select: notificationSelect,
  });
}
