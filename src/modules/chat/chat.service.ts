import {
  Prisma,
  type EstimateRequestStatus,
  type EstimateStatus,
  type UserRole,
} from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { runTransaction } from "../../utils/transaction";
import { chatRepository, type ChatMessageRow, type ChatRoomRow } from "./chat.repository";
import type { ChatMessageResponse, ChatRoomSummary, MissedChatMessagesResponse } from "./chat.type";

const ROOM_JOIN_RECOVERY_LIMIT = 50;
const CHAT_ROOM_BLOCKED_ESTIMATE_STATUSES: readonly EstimateStatus[] = ["EXPIRED", "CANCELED"];
const CHAT_ROOM_BLOCKED_REQUEST_STATUSES: readonly EstimateRequestStatus[] = [
  "COMPLETED",
  "EXPIRED",
  "CANCELED",
];

function isParticipant(room: Pick<ChatRoomRow, "customerId" | "moverId">, userId: string): boolean {
  return room.customerId === userId || room.moverId === userId;
}

function assertParticipant(
  room: Pick<ChatRoomRow, "customerId" | "moverId">,
  userId: string,
): void {
  if (!isParticipant(room, userId)) {
    throw new AppError("FORBIDDEN", {
      message: "채팅방에 접근할 권한이 없습니다.",
    });
  }
}

function toParticipant(user: { id: string; name: string; role: UserRole }) {
  return {
    id: user.id,
    name: user.name,
    role: user.role as "CUSTOMER" | "MOVER",
  };
}

function mapRoom(room: ChatRoomRow): ChatRoomSummary {
  return {
    id: room.id,
    estimateId: room.estimateId,
    estimateRequestId: room.estimateRequestId,
    customer: toParticipant(room.customer),
    mover: toParticipant(room.mover),
    lastMessageAt: room.lastMessageAt,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

function mapMessage(message: ChatMessageRow): ChatMessageResponse {
  const isSystemMessage = message.type === "SYSTEM";

  return {
    id: message.id,
    roomId: message.roomId,
    // 이전 데이터에 관리자 senderId가 남아 있더라도 SYSTEM 응답은 발신자 없이 통일합니다.
    senderId: isSystemMessage ? null : message.senderId,
    type: message.type,
    content: message.content,
    imageUrl: message.imageUrl,
    isRead: message.isRead,
    readAt: message.readAt,
    createdAt: message.createdAt,
    sender: isSystemMessage || !message.sender ? null : toParticipant(message.sender),
  };
}

function isChatRoomUniqueError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;

  if (!Array.isArray(target)) {
    return false;
  }

  const normalizedTarget = target.map(String);
  const hasEstimateId =
    normalizedTarget.includes("estimateId") || normalizedTarget.includes("estimate_id");
  const hasEstimateRequestId =
    normalizedTarget.includes("estimateRequestId") ||
    normalizedTarget.includes("estimate_request_id");
  const hasMoverId = normalizedTarget.includes("moverId") || normalizedTarget.includes("mover_id");

  return hasEstimateId || (hasEstimateRequestId && hasMoverId);
}

function assertChatRoomCreatable(estimate: {
  status: EstimateStatus;
  estimateRequest: {
    status: EstimateRequestStatus;
  };
}): void {
  if (CHAT_ROOM_BLOCKED_ESTIMATE_STATUSES.includes(estimate.status)) {
    throw new AppError("CONFLICT", {
      message: "취소되었거나 만료된 견적은 채팅방을 생성할 수 없습니다.",
    });
  }

  if (CHAT_ROOM_BLOCKED_REQUEST_STATUSES.includes(estimate.estimateRequest.status)) {
    throw new AppError("CONFLICT", {
      message: "종료된 견적 요청은 채팅방을 생성할 수 없습니다.",
    });
  }
}

export const chatService = {
  async getOrCreateRoom(userId: string, estimateId: number): Promise<ChatRoomSummary> {
    const room = await chatRepository.findRoomByEstimateId(estimateId);

    if (room) {
      assertParticipant(room, userId);
      return mapRoom(room);
    }

    const estimate = await chatRepository.findEstimateForRoom(estimateId);

    if (!estimate) {
      throw new AppError("ESTIMATE_NOT_FOUND");
    }

    assertChatRoomCreatable(estimate);

    const customerId = estimate.estimateRequest.customerId;
    const moverId = estimate.moverId;

    if (customerId !== userId && moverId !== userId) {
      throw new AppError("FORBIDDEN", {
        message: "해당 견적의 채팅방을 생성할 권한이 없습니다.",
      });
    }

    try {
      const createdRoom = await chatRepository.createRoom({
        estimateId: estimate.id,
        estimateRequestId: estimate.estimateRequestId,
        customerId,
        moverId,
      });

      return mapRoom(createdRoom);
    } catch (error) {
      if (!isChatRoomUniqueError(error)) {
        throw error;
      }

      const existingRoom = await chatRepository.findRoomByEstimateId(estimateId);

      if (!existingRoom) {
        throw error;
      }

      assertParticipant(existingRoom, userId);
      return mapRoom(existingRoom);
    }
  },

  async getRoom(userId: string, roomId: number): Promise<ChatRoomSummary> {
    const room = await chatRepository.findRoomById(roomId);

    if (!room) {
      throw new AppError("NOT_FOUND", {
        message: "채팅방을 찾을 수 없습니다.",
      });
    }

    assertParticipant(room, userId);
    return mapRoom(room);
  },

  async getMessages(userId: string, roomId: number, query: { cursor?: number; limit: number }) {
    await this.getRoom(userId, roomId);
    const cursor = query.cursor
      ? await chatRepository.findMessageCursor({
          roomId,
          messageId: query.cursor,
        })
      : undefined;

    if (query.cursor && !cursor) {
      throw new AppError("VALIDATION_ERROR", {
        message: "유효하지 않은 메시지 커서입니다.",
      });
    }

    const [messages, totalCount] = await Promise.all([
      chatRepository.findMessages({
        roomId,
        take: query.limit + 1,
        ...(cursor ? { cursor } : {}),
      }),
      chatRepository.countMessages(roomId),
    ]);

    const hasNext = messages.length > query.limit;
    const pageMessages = messages.slice(0, query.limit);
    const orderedMessages = [...pageMessages].reverse();
    const oldestMessage = pageMessages.at(-1);

    return {
      messages: orderedMessages.map(mapMessage),
      pagination: {
        limit: query.limit,
        totalCount,
        hasNext,
        nextCursor: hasNext && oldestMessage ? String(oldestMessage.id) : null,
      },
    };
  },

  async joinRoom(userId: string, roomId: number, lastMessageId?: number | null) {
    const room = await this.getRoom(userId, roomId);
    const cursor = lastMessageId
      ? await chatRepository.findMessageCursor({
          roomId,
          messageId: lastMessageId,
        })
      : undefined;

    if (lastMessageId && !cursor) {
      throw new AppError("VALIDATION_ERROR", {
        message: "유효하지 않은 메시지 ID입니다.",
      });
    }

    const missedMessageRows = cursor
      ? await chatRepository.findMessagesAfterCursor({
          roomId,
          cursor,
          take: ROOM_JOIN_RECOVERY_LIMIT + 1,
        })
      : [];
    const hasMore = missedMessageRows.length > ROOM_JOIN_RECOVERY_LIMIT;
    const pageMessageRows = missedMessageRows.slice(0, ROOM_JOIN_RECOVERY_LIMIT);
    const lastMissedMessage = pageMessageRows.at(-1);
    const missedMessages = {
      messages: pageMessageRows.map(mapMessage),
      hasMore,
      nextMessageId: hasMore && lastMissedMessage ? lastMissedMessage.id : null,
    } satisfies MissedChatMessagesResponse;

    return {
      room,
      missedMessages,
    };
  },

  async createTextMessage(userId: string, roomId: number, content: string) {
    await this.getRoom(userId, roomId);

    return this.createTextMessageForJoinedRoom(userId, roomId, content);
  },

  async createTextMessageForJoinedRoom(senderId: string, roomId: number, content: string) {
    // 소켓의 chat:room:join에서 이미 권한 검증이 끝난 전송 경로입니다.

    const message = await runTransaction(async (tx) => {
      const createdMessage = await chatRepository.createTextMessage(
        {
          roomId,
          senderId,
          content,
        },
        tx,
      );

      await chatRepository.updateRoomLastMessageAt(roomId, createdMessage.createdAt, tx);

      return createdMessage;
    });

    return mapMessage(message);
  },
};
