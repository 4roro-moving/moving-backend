import type { Server as HttpServer } from "node:http";

import { Server as SocketIOServer } from "socket.io";

import { env } from "../config/env";
import logger from "../config/logger";
import { socketAuthenticate } from "../middlewares/socket-auth";
import { registerChatSocketHandlers } from "../modules/chat/chat.socket";

export const initializeSocket = (httpServer: HttpServer): SocketIOServer => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true,
    },
  });

  io.use(socketAuthenticate);

  io.on("connection", (socket) => {
    logger.info("Socket connected.", {
      socketId: socket.id,
      userId: socket.data.user?.id,
    });

    registerChatSocketHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected.", {
        socketId: socket.id,
        userId: socket.data.user?.id,
        reason,
      });
    });
  });

  return io;
};
