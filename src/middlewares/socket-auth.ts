import type { ExtendedError, Socket } from "socket.io";

import { verifyAccessToken } from "../utils/jwt";

export const socketAuthenticate = (socket: Socket, next: (err?: ExtendedError) => void): void => {
  try {
    const token = socket.handshake.auth.token;

    if (typeof token !== "string" || token.length === 0) {
      next(new Error("Access Token이 필요합니다."));
      return;
    }

    const payload = verifyAccessToken(token);

    socket.data.user = {
      id: payload.userId,
      role: payload.role,
    };

    next();
  } catch {
    next(new Error("유효하지 않은 Access Token입니다."));
  }
};
