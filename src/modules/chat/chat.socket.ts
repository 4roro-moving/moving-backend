import type { Server as SocketIOServer, Socket } from "socket.io";

export const registerChatSocketHandlers = (_io: SocketIOServer, socket: Socket): void => {
  socket.on("chat:ping", (callback?: (response: { ok: boolean }) => void) => {
    callback?.({ ok: true });
  });
};
