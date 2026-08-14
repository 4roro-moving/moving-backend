import type { AuthenticatedUser } from "../modules/auth/auth.type";

declare module "socket.io" {
  interface SocketData {
    user?: AuthenticatedUser;
    roomId?: number;
    roomSequence?: number;
  }
}

export {};
