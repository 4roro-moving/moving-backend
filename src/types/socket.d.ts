import type { UserRole } from "@prisma/client";

declare module "socket.io" {
  interface SocketData {
    user?: {
      id: string;
      role: UserRole;
    };
    roomId?: number;
  }
}

export {};
