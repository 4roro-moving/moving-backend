import type { ExtendedError, Socket } from "socket.io";

import { AppError } from "../lib/app-error";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../utils/jwt";

export const socketAuthenticate = async (
  socket: Socket,
  next: (err?: ExtendedError) => void,
): Promise<void> => {
  try {
    const token = socket.handshake.auth.token;

    if (typeof token !== "string" || token.length === 0) {
      next(
        new AppError("UNAUTHORIZED", {
          message: "Access Token이 필요합니다.",
        }),
      );
      return;
    }

    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isActive: true, deletedAt: true },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new AppError("FORBIDDEN", {
        message: "비활성화되었거나 탈퇴 처리된 계정입니다.",
      });
    }

    socket.data.user = {
      id: payload.userId,
      role: payload.role,
    };

    next();
  } catch {
    next(
      new AppError("UNAUTHORIZED", {
        message: "유효하지 않은 Access Token입니다.",
      }),
    );
  }
};
