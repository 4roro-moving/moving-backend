import {
  Prisma,
  type EstimateRequestStatus,
  type EstimateStatus,
  type UserRole,
} from "@prisma/client";

import logger from "../../config/logger";
import { AppError } from "../../lib/app-error";
import { getImageUrl } from "../../utils/image-url";
import { isPastInKst } from "../../utils/kst";
import { runTransaction } from "../../utils/transaction";
import { resolveMoveDate } from "../estimate-request/estimateRequest.policy";
import { notificationService } from "../notification/notification.service";
import { chatImageService } from "./chat-image.service";
import {
  chatRepository,
  type ChatMessageRow,
  type EstimateRevisionForResponseRow,
  type ChatRoomForRevisionRow,
  type ChatRoomRow,
} from "./chat.repository";
import type { ChatMessageResponse, ChatRoomSummary, MissedChatMessagesResponse } from "./chat.type";

const ROOM_JOIN_RECOVERY_LIMIT = 50;
const CHAT_ROOM_BLOCKED_ESTIMATE_STATUSES: readonly EstimateStatus[] = ["EXPIRED", "CANCELED"];
const CHAT_ROOM_BLOCKED_REQUEST_STATUSES: readonly EstimateRequestStatus[] = [
  "COMPLETED",
  "EXPIRED",
  "CANCELED",
];
const ESTIMATE_REVISION_CONTENT = "견적 수정 요청이 도착했습니다.";

function getEstimateMoveDate(estimate: {
  moveDate: Date | null;
  estimateRequest: { moveDate: Date };
}): Date {
  return estimate.moveDate ?? estimate.estimateRequest.moveDate;
}

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
  const imageUrl = message.type === "IMAGE" ? getImageUrl(message.imageUrl) : message.imageUrl;

  return {
    id: message.id,
    roomId: message.roomId,
    // 이전 데이터에 관리자 senderId가 남아 있더라도 SYSTEM 응답은 발신자 없이 통일합니다.
    senderId: isSystemMessage ? null : message.senderId,
    type: message.type,
    content: message.content,
    imageUrl,
    isRead: message.isRead,
    readAt: message.readAt,
    createdAt: message.createdAt,
    sender: isSystemMessage || !message.sender ? null : toParticipant(message.sender),
    revision: message.revision,
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

function isNotificationUniqueError(error: unknown): boolean {
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

  const hasUserId = normalizedTarget.includes("userId") || normalizedTarget.includes("user_id");
  const hasSourceId =
    normalizedTarget.includes("sourceId") || normalizedTarget.includes("source_id");

  return hasUserId && normalizedTarget.includes("type") && hasSourceId;
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

function assertEstimateRevisionRequestable(
  room: Pick<ChatRoomForRevisionRow, "moverId" | "estimate">,
  requesterId: string,
): void {
  if (room.moverId !== requesterId) {
    throw new AppError("FORBIDDEN", {
      message: "기사님만 견적 수정을 요청할 수 있습니다.",
    });
  }

  if (room.estimate.status !== "SENT") {
    throw new AppError("CONFLICT", {
      message: "대기 중인 견적만 수정 요청을 보낼 수 있습니다.",
    });
  }

  if (room.estimate.estimateRequest.status !== "OPEN") {
    throw new AppError("CONFLICT", {
      message: "진행 중인 견적 요청에만 수정 요청을 보낼 수 있습니다.",
    });
  }
}

function assertEstimateRevisionRespondable(
  revision: Pick<EstimateRevisionForResponseRow, "status" | "chatRoom" | "estimate">,
  responderId: string,
): void {
  if (revision.chatRoom.customerId !== responderId) {
    throw new AppError("FORBIDDEN", {
      message: "고객님만 견적 수정 요청에 응답할 수 있습니다.",
    });
  }

  if (revision.status !== "PENDING") {
    throw new AppError("CONFLICT", {
      message: "이미 처리된 견적 수정 요청입니다.",
    });
  }

  if (revision.estimate.status !== "SENT") {
    throw new AppError("CONFLICT", {
      message: "대기 중인 견적의 수정 요청에만 응답할 수 있습니다.",
    });
  }

  if (revision.estimate.estimateRequest.status !== "OPEN") {
    throw new AppError("CONFLICT", {
      message: "진행 중인 견적 요청의 수정 요청에만 응답할 수 있습니다.",
    });
  }
}

function assertEstimateRevisionHasChanges(params: {
  previousMoveDate: Date;
  requestedMoveDate: Date;
  previousPrice: number;
  requestedPrice: number;
  previousComment: string;
  requestedComment: string;
}): void {
  const hasMoveDateChange =
    params.previousMoveDate.getTime() !== params.requestedMoveDate.getTime();
  const hasPriceChange = params.previousPrice !== params.requestedPrice;
  const hasCommentChange = params.previousComment !== params.requestedComment;

  if (!hasMoveDateChange && !hasPriceChange && !hasCommentChange) {
    throw new AppError("VALIDATION_ERROR", {
      message: "수정할 이사일, 견적가 또는 코멘트를 변경해주세요.",
    });
  }
}

function assertRevisionMoveDateStillValid(requestedMoveDate: Date): void {
  if (isPastInKst(requestedMoveDate)) {
    throw new AppError("CONFLICT", {
      message: "과거 이사일로는 견적 수정 요청을 승인할 수 없습니다.",
    });
  }
}

function getMessageNotificationContext(
  room: Pick<ChatRoomRow, "estimateId" | "customerId" | "moverId" | "customer" | "mover">,
  senderId: string,
) {
  assertParticipant(room, senderId);

  if (room.customerId === senderId) {
    return {
      receiverId: room.moverId,
      senderName: room.customer.name,
      linkUrl: `/estimate/sent/${String(room.estimateId)}?chat=open`,
    };
  }

  return {
    receiverId: room.customerId,
    senderName: room.mover.moverProfile?.nickname ?? room.mover.name,
    linkUrl: `/estimates/pending/${String(room.estimateId)}?chat=open`,
  };
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
    const room = await chatRepository.findRoomById(roomId);

    if (!room) {
      throw new AppError("NOT_FOUND", {
        message: "채팅방을 찾을 수 없습니다.",
      });
    }

    assertParticipant(room, senderId);

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

  async createImageMessageForJoinedRoom(senderId: string, roomId: number, imageKey: string) {
    // 소켓의 chat:room:join에서 이미 권한 검증이 끝난 전송 경로입니다.
    const room = await chatRepository.findRoomById(roomId);

    if (!room) {
      throw new AppError("NOT_FOUND", {
        message: "채팅방을 찾을 수 없습니다.",
      });
    }

    assertParticipant(room, senderId);
    const finalImageKey = await chatImageService.finalizeUploadedImage(senderId, roomId, imageKey);

    const message = await runTransaction(async (tx) => {
      const createdMessage = await chatRepository.createImageMessage(
        {
          roomId,
          senderId,
          imageUrl: finalImageKey,
        },
        tx,
      );

      await chatRepository.updateRoomLastMessageAt(roomId, createdMessage.createdAt, tx);

      return createdMessage;
    });

    return mapMessage(message);
  },

  async createEstimateRevisionForJoinedRoom(
    requesterId: string,
    roomId: number,
    input: {
      requestedMoveDate: string;
      requestedPrice: number;
      requestedComment: string;
    },
  ) {
    // 소켓의 chat:room:join에서 이미 권한 검증이 끝난 전송 경로입니다.
    const room = await chatRepository.findRoomForRevision(roomId);

    if (!room) {
      throw new AppError("NOT_FOUND", {
        message: "채팅방을 찾을 수 없습니다.",
      });
    }

    assertParticipant(room, requesterId);
    assertEstimateRevisionRequestable(room, requesterId);
    const requestedMoveDate = resolveMoveDate(input.requestedMoveDate);

    const message = await runTransaction(
      async (tx) => {
        const lockedRoom = await chatRepository.findRoomForRevision(roomId, tx);

        if (!lockedRoom) {
          throw new AppError("NOT_FOUND", {
            message: "채팅방을 찾을 수 없습니다.",
          });
        }

        assertParticipant(lockedRoom, requesterId);
        assertEstimateRevisionRequestable(lockedRoom, requesterId);
        const previousMoveDate = getEstimateMoveDate(lockedRoom.estimate);
        assertEstimateRevisionHasChanges({
          previousMoveDate,
          requestedMoveDate,
          previousPrice: lockedRoom.estimate.price,
          requestedPrice: input.requestedPrice,
          previousComment: lockedRoom.estimate.comment,
          requestedComment: input.requestedComment,
        });

        const pendingRevision = await chatRepository.findPendingEstimateRevision(
          lockedRoom.estimateId,
          tx,
        );

        if (pendingRevision) {
          throw new AppError("CONFLICT", {
            message: "이미 응답 대기 중인 견적 수정 요청이 있습니다.",
          });
        }

        const revision = await chatRepository.createEstimateRevision(
          {
            roomId,
            estimateId: lockedRoom.estimateId,
            requesterId,
            previousPrice: lockedRoom.estimate.price,
            requestedPrice: input.requestedPrice,
            previousMoveDate,
            requestedMoveDate,
            previousComment: lockedRoom.estimate.comment,
            requestedComment: input.requestedComment,
          },
          tx,
        );

        const createdMessage = await chatRepository.createEstimateRevisionMessage(
          {
            roomId,
            senderId: requesterId,
            content: ESTIMATE_REVISION_CONTENT,
          },
          tx,
        );

        await chatRepository.updateEstimateRevisionMessageId(
          {
            revisionId: revision.id,
            messageId: createdMessage.id,
          },
          tx,
        );
        await chatRepository.updateRoomLastMessageAt(roomId, createdMessage.createdAt, tx);

        const messageWithRevision = await chatRepository.findMessageById(createdMessage.id, tx);

        if (!messageWithRevision) {
          throw new AppError("INTERNAL_SERVER_ERROR", {
            message: "견적 수정 메시지를 생성하지 못했습니다.",
          });
        }

        return messageWithRevision;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return mapMessage(message);
  },

  async respondEstimateRevisionForJoinedRoom(
    responderId: string,
    roomId: number,
    input: {
      revisionId: number;
      response: "APPROVED" | "REJECTED";
    },
  ) {
    // 소켓의 chat:room:join에서 이미 권한 검증이 끝난 응답 경로입니다.
    const revision = await chatRepository.findEstimateRevisionForResponse(input.revisionId);

    if (!revision || revision.chatRoomId !== roomId) {
      throw new AppError("NOT_FOUND", {
        message: "견적 수정 요청을 찾을 수 없습니다.",
      });
    }

    assertParticipant(revision.chatRoom, responderId);
    assertEstimateRevisionRespondable(revision, responderId);

    const message = await runTransaction(
      async (tx) => {
        const lockedRevision = await chatRepository.findEstimateRevisionForResponse(
          input.revisionId,
          tx,
        );

        if (!lockedRevision || lockedRevision.chatRoomId !== roomId) {
          throw new AppError("NOT_FOUND", {
            message: "견적 수정 요청을 찾을 수 없습니다.",
          });
        }

        assertParticipant(lockedRevision.chatRoom, responderId);
        assertEstimateRevisionRespondable(lockedRevision, responderId);

        const respondedAt = new Date();

        if (input.response === "APPROVED") {
          assertRevisionMoveDateStillValid(lockedRevision.requestedMoveDate);

          await chatRepository.updateEstimateForRevision(
            {
              estimateId: lockedRevision.estimateId,
              price: lockedRevision.requestedPrice,
              comment: lockedRevision.requestedComment,
              moveDate: lockedRevision.requestedMoveDate,
            },
            tx,
          );
        }

        await chatRepository.updateEstimateRevisionResponse(
          {
            revisionId: lockedRevision.id,
            responderId,
            status: input.response,
            respondedAt,
          },
          tx,
        );

        if (!lockedRevision.messageId) {
          throw new AppError("INTERNAL_SERVER_ERROR", {
            message: "견적 수정 메시지를 찾을 수 없습니다.",
          });
        }

        const messageWithRevision = await chatRepository.findMessageById(
          lockedRevision.messageId,
          tx,
        );

        if (!messageWithRevision) {
          throw new AppError("INTERNAL_SERVER_ERROR", {
            message: "견적 수정 메시지를 조회하지 못했습니다.",
          });
        }

        return messageWithRevision;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return mapMessage(message);
  },

  async createMessageReceivedNotification(params: {
    roomId: number;
    senderId: string;
    messageId: number;
    skip: boolean;
  }): Promise<void> {
    if (params.skip) {
      return;
    }

    try {
      const room = await chatRepository.findRoomById(params.roomId);

      if (!room) {
        logger.error("Failed to create CHAT_MESSAGE_RECEIVED notification.", {
          reason: "CHAT_ROOM_NOT_FOUND",
          roomId: params.roomId,
          messageId: params.messageId,
          senderId: params.senderId,
        });
        return;
      }

      const { receiverId, senderName, linkUrl } = getMessageNotificationContext(
        room,
        params.senderId,
      );

      const notification = await notificationService.createNotification({
        userId: receiverId,
        type: "CHAT_MESSAGE_RECEIVED",
        title: "새 메시지",
        content: senderName,
        linkUrl,
        sourceId: `chat-message:${params.messageId}`,
        expiresAt: null,
      });

      notificationService.sendNotification(receiverId, notification);
    } catch (error) {
      if (isNotificationUniqueError(error)) {
        return;
      }

      logger.error("Failed to create CHAT_MESSAGE_RECEIVED notification.", {
        error,
        roomId: params.roomId,
        messageId: params.messageId,
        senderId: params.senderId,
      });
    }
  },

  async createEstimateRevisionRequestedNotification(params: {
    roomId: number;
    requesterId: string;
    messageId: number;
    skip: boolean;
  }): Promise<void> {
    if (params.skip) {
      return;
    }

    try {
      const room = await chatRepository.findRoomById(params.roomId);

      if (!room) {
        logger.error("Failed to create ESTIMATE_REVISION_REQUESTED notification.", {
          reason: "CHAT_ROOM_NOT_FOUND",
          roomId: params.roomId,
          messageId: params.messageId,
          requesterId: params.requesterId,
        });
        return;
      }

      if (room.moverId !== params.requesterId) {
        logger.error("Failed to create ESTIMATE_REVISION_REQUESTED notification.", {
          reason: "REQUESTER_IS_NOT_MOVER",
          roomId: params.roomId,
          messageId: params.messageId,
          requesterId: params.requesterId,
        });
        return;
      }

      const moverName = room.mover.moverProfile?.nickname ?? room.mover.name;
      const notification = await notificationService.createNotification({
        userId: room.customerId,
        type: "ESTIMATE_REVISION_REQUESTED",
        title: "견적 수정 요청",
        content: `${moverName} 기사님이 견적 수정을 요청했습니다.`,
        linkUrl: `/estimates/pending/${String(room.estimateId)}?chat=open`,
        sourceId: `estimate-revision:${params.messageId}`,
        expiresAt: null,
      });

      notificationService.sendNotification(room.customerId, notification);
    } catch (error) {
      if (isNotificationUniqueError(error)) {
        return;
      }

      logger.error("Failed to create ESTIMATE_REVISION_REQUESTED notification.", {
        error,
        roomId: params.roomId,
        messageId: params.messageId,
        requesterId: params.requesterId,
      });
    }
  },

  async createEstimateRevisionResponseNotification(params: {
    roomId: number;
    responderId: string;
    messageId: number;
    revisionId: number;
    response: "APPROVED" | "REJECTED";
    skip: boolean;
  }): Promise<void> {
    if (params.skip) {
      return;
    }

    const notificationType =
      params.response === "APPROVED" ? "ESTIMATE_REVISION_APPROVED" : "ESTIMATE_REVISION_REJECTED";
    const actionLabel = params.response === "APPROVED" ? "승인" : "거절";

    try {
      const room = await chatRepository.findRoomById(params.roomId);

      if (!room) {
        logger.error(`Failed to create ${notificationType} notification.`, {
          reason: "CHAT_ROOM_NOT_FOUND",
          roomId: params.roomId,
          messageId: params.messageId,
          revisionId: params.revisionId,
          responderId: params.responderId,
        });
        return;
      }

      if (room.customerId !== params.responderId) {
        logger.error(`Failed to create ${notificationType} notification.`, {
          reason: "RESPONDER_IS_NOT_CUSTOMER",
          roomId: params.roomId,
          messageId: params.messageId,
          revisionId: params.revisionId,
          responderId: params.responderId,
        });
        return;
      }

      const notification = await notificationService.createNotification({
        userId: room.moverId,
        type: notificationType,
        title: `견적 수정 요청 ${actionLabel}`,
        content: `${room.customer.name} 고객님이 견적 수정 요청을 ${actionLabel}했습니다.`,
        linkUrl: `/estimate/sent/${String(room.estimateId)}?chat=open`,
        sourceId: `estimate-revision-response:${String(params.revisionId)}:${params.response}`,
        expiresAt: null,
      });

      notificationService.sendNotification(room.moverId, notification);
    } catch (error) {
      if (isNotificationUniqueError(error)) {
        return;
      }

      logger.error(`Failed to create ${notificationType} notification.`, {
        error,
        roomId: params.roomId,
        messageId: params.messageId,
        revisionId: params.revisionId,
        responderId: params.responderId,
      });
    }
  },
};
