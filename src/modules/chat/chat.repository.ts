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
  revision: {
    select: {
      id: true,
      estimateId: true,
      requesterId: true,
      responderId: true,
      previousPrice: true,
      requestedPrice: true,
      previousMoveDate: true,
      requestedMoveDate: true,
      previousComment: true,
      requestedComment: true,
      status: true,
      createdAt: true,
      respondedAt: true,
    },
  },
} satisfies Prisma.ChatMessageSelect;

export type ChatRoomRow = Prisma.ChatRoomGetPayload<{ select: typeof chatRoomSelect }>;
export type ChatMessageRow = Prisma.ChatMessageGetPayload<{ select: typeof chatMessageSelect }>;

const chatRoomForRevisionSelect = {
  ...chatRoomSelect,
  estimate: {
    select: {
      id: true,
      price: true,
      comment: true,
      moveDate: true,
      status: true,
      estimateRequest: {
        select: {
          status: true,
          id: true,
          moveDate: true,
        },
      },
    },
  },
} satisfies Prisma.ChatRoomSelect;

export type ChatRoomForRevisionRow = Prisma.ChatRoomGetPayload<{
  select: typeof chatRoomForRevisionSelect;
}>;

const estimateRevisionForResponseSelect = {
  id: true,
  chatRoomId: true,
  estimateId: true,
  requesterId: true,
  responderId: true,
  messageId: true,
  previousPrice: true,
  requestedPrice: true,
  previousMoveDate: true,
  requestedMoveDate: true,
  previousComment: true,
  requestedComment: true,
  status: true,
  estimate: {
    select: {
      id: true,
      status: true,
      moveDate: true,
      estimateRequest: {
        select: {
          id: true,
          status: true,
          moveDate: true,
        },
      },
    },
  },
  chatRoom: {
    select: chatRoomSelect,
  },
} satisfies Prisma.EstimateRevisionSelect;

export type EstimateRevisionForResponseRow = Prisma.EstimateRevisionGetPayload<{
  select: typeof estimateRevisionForResponseSelect;
}>;

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

  findRoomForRevision(roomId: number, db: DbClient = prisma) {
    return db.chatRoom.findUnique({
      where: { id: roomId },
      select: chatRoomForRevisionSelect,
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

  findMessageById(messageId: number, db: DbClient = prisma) {
    return db.chatMessage.findUnique({
      where: { id: messageId },
      select: chatMessageSelect,
    });
  },

  findPendingEstimateRevision(estimateId: number, db: DbClient = prisma) {
    return db.estimateRevision.findFirst({
      where: {
        estimateId,
        status: "PENDING",
      },
      select: {
        id: true,
      },
    });
  },

  createEstimateRevision(
    data: {
      roomId: number;
      estimateId: number;
      requesterId: string;
      previousPrice: number;
      requestedPrice: number;
      previousMoveDate: Date;
      requestedMoveDate: Date;
      previousComment: string;
      requestedComment: string;
    },
    db: DbClient = prisma,
  ) {
    return db.estimateRevision.create({
      data: {
        chatRoomId: data.roomId,
        estimateId: data.estimateId,
        requesterId: data.requesterId,
        previousPrice: data.previousPrice,
        requestedPrice: data.requestedPrice,
        previousMoveDate: data.previousMoveDate,
        requestedMoveDate: data.requestedMoveDate,
        previousComment: data.previousComment,
        requestedComment: data.requestedComment,
      },
      select: {
        id: true,
      },
    });
  },

  createEstimateRevisionMessage(
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
        type: "ESTIMATE_REVISION",
        content: data.content,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });
  },

  updateEstimateRevisionMessageId(
    data: {
      revisionId: number;
      messageId: number;
    },
    db: DbClient = prisma,
  ) {
    return db.estimateRevision.update({
      where: { id: data.revisionId },
      data: { messageId: data.messageId },
      select: { id: true },
    });
  },

  findEstimateRevisionForResponse(revisionId: number, db: DbClient = prisma) {
    return db.estimateRevision.findUnique({
      where: { id: revisionId },
      select: estimateRevisionForResponseSelect,
    });
  },

  updateEstimateRevisionResponse(
    data: {
      revisionId: number;
      responderId: string;
      status: "APPROVED" | "REJECTED";
      respondedAt: Date;
    },
    db: DbClient = prisma,
  ) {
    return db.estimateRevision.update({
      where: { id: data.revisionId },
      data: {
        responderId: data.responderId,
        status: data.status,
        respondedAt: data.respondedAt,
      },
      select: { id: true },
    });
  },

  updateEstimateForRevision(
    data: {
      estimateId: number;
      price: number;
      comment: string;
      moveDate: Date;
    },
    db: DbClient = prisma,
  ) {
    return db.estimate.update({
      where: { id: data.estimateId },
      data: {
        price: data.price,
        comment: data.comment,
        moveDate: data.moveDate,
      },
      select: { id: true },
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
