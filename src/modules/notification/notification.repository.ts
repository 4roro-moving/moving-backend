import { NotificationType } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

import type { CreateNotificationInput } from "./notification.type";

const NOTIFICATION_LIST_LIMIT = 5;

/*
 * 알림 조회 및 생성 결과에서 공통으로 반환할 필드를 정의한다.
 *
 * userId는 알림 소유권 확인이 필요한 findById에서만
 * 별도로 추가하여 조회한다.
 */
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

/*
 * 사용자의 유효한 알림 목록을 조회한다.
 *
 * expiresAt이 null인 무기한 알림과
 * 현재 시각보다 expiresAt이 이후인 알림만 조회한다.
 *
 * 최신순으로 최대 5개까지 반환한다.
 */
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

/*
 * 사용자의 유효한 미읽음 알림 개수를 조회한다.
 *
 * 이미 읽은 알림과 만료된 알림은
 * 미읽음 개수에서 제외한다.
 */
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

/*
 * 알림 ID를 기준으로 단일 알림을 조회한다.
 *
 * Service에서 알림 소유자를 확인해야 하므로
 * 공통 조회 필드에 userId를 추가하여 반환한다.
 *
 * 만료 여부와 소유권 검사는 Service에서 처리한다.
 */
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

/*
 * 단일 알림을 읽음 처리한다.
 *
 * isRead와 readAt을 갱신한다.
 *
 * 채팅 알림처럼 읽음 처리 시 만료일을 변경해야 하는 경우에는
 * expiresAt을 전달받아 함께 갱신한다.
 *
 * expiresAt이 undefined이면 기존 만료일을 유지한다.
 */
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

/*
 * 사용자의 유효한 미읽음 알림을 모두 읽음 처리한다.
 *
 * 채팅 알림은 읽은 시점부터 3일간 추가 노출해야 하므로
 * isRead, readAt, expiresAt을 함께 갱신한다.
 *
 * 채팅 이외의 알림은
 * isRead와 readAt만 갱신하고 기존 expiresAt을 유지한다.
 *
 * 두 번의 updateMany는 Service에서
 * 하나의 트랜잭션으로 묶어 실행한다.
 */
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

/*
 * 새로운 알림을 생성한다.
 *
 * 다른 도메인의 Service에서 전달받은 사용자, 알림 타입,
 * 제목, 내용, 이동 경로, 만료일을 저장한다.
 *
 * linkUrl과 expiresAt이 전달되지 않으면
 * null로 저장한다.
 */
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

/*
 * 만료 후 보관 기간인 90일이 지난 알림을 영구 삭제한다.
 *
 * 삭제 기준 시각인 deleteBefore보다
 * expiresAt이 이전인 알림만 삭제한다.
 *
 * expiresAt이 null인 무기한 알림은
 * 자동 삭제 대상에서 제외한다.
 */
async function deleteExpiredNotifications(
  deleteBefore: Date,
  db: DbClient = prisma,
): Promise<number> {
  const result = await db.notification.deleteMany({
    where: {
      expiresAt: {
        not: null,
        lt: deleteBefore,
      },
    },
  });

  return result.count;
}

export const notificationRepository = {
  findManyByUserId,
  countUnreadByUserId,
  findById,
  markAsRead,
  markAllAsRead,
  create,
  deleteExpiredNotifications,
};
