import type { Server as HttpServer } from "node:http";

import { Server as SocketIOServer } from "socket.io";

import { env } from "../config/env";
import logger from "../config/logger";
import { socketAuthenticate } from "../middlewares/socket-auth";
import { registerChatSocketHandlers } from "../modules/chat/chat.socket";
import type { ChatMessageResponse } from "../modules/chat/chat.type";

let io: SocketIOServer | null = null;

/** 정지·탈퇴 처리 직후 해당 사용자의 기존 Socket.IO 연결을 종료합니다. */
export const disconnectUserSockets = (userId: string): void => {
  if (!io) {
    return;
  }

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.user?.id === userId) {
      socket.disconnect(true);
    }
  }
};

type StoredSystemChatMessage = Pick<
  ChatMessageResponse,
  "id" | "roomId" | "type" | "content" | "imageUrl" | "isRead" | "readAt" | "createdAt"
>;

/** 트랜잭션 커밋 후 저장된 SYSTEM 메시지를 채팅방 참여자에게 실시간 전송합니다. */
export const emitSystemChatMessages = (messages: StoredSystemChatMessage[]): void => {
  if (!io) {
    return;
  }

  for (const message of messages) {
    io.to(`chat:room:${String(message.roomId)}`).emit("chat:message:new", {
      ...message,
      senderId: null,
      sender: null,
      revision: null,
    } satisfies ChatMessageResponse);
  }
};

export const initializeSocket = (httpServer: HttpServer): SocketIOServer => {
  const socketServer = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true,
    },
  });

  io = socketServer;

  socketServer.use(socketAuthenticate);

  socketServer.on("connection", (socket) => {
    logger.info("Socket connected.", {
      socketId: socket.id,
      userId: socket.data.user?.id,
    });

    registerChatSocketHandlers(socketServer, socket);

    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected.", {
        socketId: socket.id,
        userId: socket.data.user?.id,
        reason,
      });
    });
  });

  return socketServer;
};

export const closeSocketServer = (): Promise<boolean> => {
  if (!io) {
    return Promise.resolve(false);
  }

  const socketServer = io;

  return new Promise((resolve, reject) => {
    socketServer.close((error) => {
      io = null;

      if (error) {
        reject(error);
        return;
      }

      logger.info("Socket.IO server closed successfully.");
      resolve(true);
    });
  });
};
