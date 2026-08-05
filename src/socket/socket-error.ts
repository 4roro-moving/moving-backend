import type { Socket } from "socket.io";
import { ZodError } from "zod";

import { AppError } from "../lib/app-error";

export type SocketErrorResponse = {
  code: string;
  message: string;
};

export function toSocketError(error: unknown): SocketErrorResponse {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
    };
  }

  return {
    code: "INTERNAL_SERVER_ERROR",
    message: "소켓 이벤트 처리 중 오류가 발생했습니다.",
  };
}

export function emitSocketError(socket: Socket, error: unknown): SocketErrorResponse {
  const socketError = toSocketError(error);
  socket.emit("socket:error", socketError);

  return socketError;
}
