import type { Server as SocketIOServer, Socket } from "socket.io";

import { AppError } from "../../lib/app-error";
import { emitSocketError, type SocketErrorResponse } from "../../socket/socket-error";
import { chatService } from "./chat.service";
import type { ChatMessageResponse, ChatRoomSummary, MissedChatMessagesResponse } from "./chat.type";
import { joinChatRoomPayloadSchema, sendChatMessagePayloadSchema } from "./chat.validator";

type JoinRoomAck =
  | {
      ok: true;
      room: ChatRoomSummary;
      missedMessages: MissedChatMessagesResponse;
    }
  | {
      ok: false;
      error: SocketErrorResponse;
    };

type SendMessageAck =
  | {
      ok: true;
      message: ChatMessageResponse;
      clientMessageId?: string;
    }
  | {
      ok: false;
      error: SocketErrorResponse;
      clientMessageId?: string;
    };

const toRoomName = (roomId: number): string => `chat:room:${roomId}`;

function hasReceiverSocketInRoom(io: SocketIOServer, roomId: number, senderId: string): boolean {
  const socketIds = io.sockets.adapter.rooms.get(toRoomName(roomId));

  if (!socketIds) {
    return false;
  }

  for (const socketId of socketIds) {
    const roomSocket = io.sockets.sockets.get(socketId);
    const userId = roomSocket?.data.user?.id;

    if (userId && userId !== senderId) {
      return true;
    }
  }

  return false;
}

function getSocketUserId(socket: Socket): string {
  const userId = socket.data.user?.id;

  if (!userId) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  return userId;
}

export const registerChatSocketHandlers = (io: SocketIOServer, socket: Socket): void => {
  socket.on("chat:ping", (callback?: (response: { ok: boolean }) => void) => {
    callback?.({ ok: true });
  });

  socket.on(
    "chat:room:join",
    async (payload: unknown, callback?: (response: JoinRoomAck) => void) => {
      try {
        const input = joinChatRoomPayloadSchema.parse(payload);
        const result = await chatService.joinRoom(
          getSocketUserId(socket),
          input.roomId,
          input.lastMessageId,
        );

        if (socket.data.roomId && socket.data.roomId !== input.roomId) {
          socket.leave(toRoomName(socket.data.roomId));
        }

        socket.data.roomId = input.roomId;
        socket.join(toRoomName(input.roomId));

        socket.emit("chat:room:joined", result);
        callback?.({ ok: true, ...result });
      } catch (error) {
        callback?.({ ok: false, error: emitSocketError(socket, error) });
      }
    },
  );

  socket.on(
    "chat:message:send",
    async (payload: unknown, callback?: (response: SendMessageAck) => void) => {
      const clientMessageId =
        typeof payload === "object" &&
        payload !== null &&
        "clientMessageId" in payload &&
        typeof payload.clientMessageId === "string"
          ? payload.clientMessageId
          : undefined;

      try {
        const input = sendChatMessagePayloadSchema.parse(payload);
        const senderId = getSocketUserId(socket);

        if (socket.data.roomId !== input.roomId) {
          throw new AppError("FORBIDDEN", {
            message: "채팅방 입장 후 메시지를 보낼 수 있습니다.",
          });
        }

        const message = await chatService.createTextMessageForJoinedRoom(
          senderId,
          input.roomId,
          input.content,
        );

        io.to(toRoomName(input.roomId)).emit("chat:message:new", message);
        void chatService.createMessageReceivedNotification({
          roomId: input.roomId,
          senderId,
          messageId: message.id,
          skip: hasReceiverSocketInRoom(io, input.roomId, senderId),
        });

        callback?.({
          ok: true,
          message,
          ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
        });
      } catch (error) {
        callback?.({
          ok: false,
          error: emitSocketError(socket, error),
          ...(clientMessageId ? { clientMessageId } : {}),
        });
      }
    },
  );
};
