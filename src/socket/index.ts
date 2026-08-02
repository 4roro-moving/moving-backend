import type { Server as HttpServer } from "node:http";

import { Server as SocketIOServer } from "socket.io";

import { env } from "../config/env";
import logger from "../config/logger";
import { socketAuthenticate } from "../middlewares/socket-auth";
import { registerChatSocketHandlers } from "../modules/chat/chat.socket";

let io: SocketIOServer | null = null;

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

export const closeSocketServer = (): Promise<void> => {
  if (!io) {
    return Promise.resolve();
  }

  const socketServer = io;

  return new Promise((resolve) => {
    socketServer.close(() => {
      logger.info("Socket.IO server closed successfully.");
      io = null;
      resolve();
    });
  });
};
