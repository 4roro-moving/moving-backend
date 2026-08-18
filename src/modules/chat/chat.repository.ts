import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

const chatRoomSelect = {
  id: true,
  estimateId: true,
  estimateRequestId: true,
  customerId: true,
  moverId: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  mover: {
    select: {
      id: true,
      name: true,
      role: true,
      moverProfile: {
        select: {
          nickname: true,
        },
      },
    },
  },
} satisfies Prisma.ChatRoomSelect;

const chatMessageSelect = {
  id: true,
  roomId: true,
  senderId: true,
  type: true,
  content: true,
  imageUrl: true,
  isRead: true,
  readAt: true,
  createdAt: true,
  sender: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
} satisfies Prisma.ChatMessageSelect;

export type ChatRoomRow = Prisma.ChatRoomGetPayload<{ select: typeof chatRoomSelect }>;
export type ChatMessageRow = Prisma.ChatMessageGetPayload<{ select: typeof chatMessageSelect }>;

type ChatMessageCursor = {
  createdAt: Date;
  id: number;
};

export const chatRepository = {
  findEstimateForRoom(estimateId: number, db: DbClient = prisma) {
    return db.estimate.findUnique({
      where: { id: estimateId },
      select: {
        id: true,
        status: true,
        estimateRequestId: true,
        moverId: true,
        estimateRequest: {
          select: {
            customerId: true,
            status: true,
          },
        },
      },
    });
  },

  findRoomByEstimateId(estimateId: number, db: DbClient = prisma) {
    return db.chatRoom.findUnique({
      where: { estimateId },
      select: chatRoomSelect,
    });
  },

  findRoomById(roomId: number, db: DbClient = prisma) {
    return db.chatRoom.findUnique({
      where: { id: roomId },
      select: chatRoomSelect,
    });
  },

  createRoom(
    data: {
      estimateId: number;
      estimateRequestId: number;
      customerId: string;
      moverId: string;
    },
    db: DbClient = prisma,
  ) {
    return db.chatRoom.create({
      data,
      select: chatRoomSelect,
    });
  },

  findMessageCursor(params: { roomId: number; messageId: number }, db: DbClient = prisma) {
    return db.chatMessage.findFirst({
      where: {
        roomId: params.roomId,
        id: params.messageId,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });
  },

  findMessages(
    params: { roomId: number; cursor?: ChatMessageCursor; take: number },
    db: DbClient = prisma,
  ) {
    return db.chatMessage.findMany({
      where: {
        roomId: params.roomId,
        ...(params.cursor
          ? {
              OR: [
                { createdAt: { lt: params.cursor.createdAt } },
                {
                  createdAt: params.cursor.createdAt,
                  id: { lt: params.cursor.id },
                },
              ],
            }
          : {}),
      },
      select: chatMessageSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.take,
    });
  },

  countMessages(roomId: number, db: DbClient = prisma) {
    return db.chatMessage.count({
      where: { roomId },
    });
  },

  findMessagesAfterCursor(
    params: { roomId: number; cursor: ChatMessageCursor; take: number },
    db: DbClient = prisma,
  ) {
    return db.chatMessage.findMany({
      where: {
        roomId: params.roomId,
        OR: [
          { createdAt: { gt: params.cursor.createdAt } },
          {
            createdAt: params.cursor.createdAt,
            id: { gt: params.cursor.id },
          },
        ],
      },
      select: chatMessageSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: params.take,
    });
  },

  createTextMessage(
    data: {
      roomId: number;
      senderId: string;
      content: string;
    },
    db: DbClient = prisma,
  ) {
    return db.chatMessage.create({
      data: {
        roomId: data.roomId,
        senderId: data.senderId,
        type: "TEXT",
        content: data.content,
      },
      select: chatMessageSelect,
    });
  },

  createImageMessage(
    data: {
      roomId: number;
      senderId: string;
      imageUrl: string;
    },
    db: DbClient = prisma,
  ) {
    return db.chatMessage.create({
      data: {
        roomId: data.roomId,
        senderId: data.senderId,
        type: "IMAGE",
        content: null,
        imageUrl: data.imageUrl,
      },
      select: chatMessageSelect,
    });
  },

  updateRoomLastMessageAt(roomId: number, lastMessageAt: Date, db: DbClient = prisma) {
    return db.chatRoom.update({
      where: { id: roomId },
      data: { lastMessageAt },
      select: { id: true },
    });
  },
};
