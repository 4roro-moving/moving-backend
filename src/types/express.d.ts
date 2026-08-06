import type { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
      };

      admin?: {
        id: string;
        email: string;
        name: string;
        role: UserRole;
        isActive: boolean;
        createdAt: Date;
      };
    }
  }
}

export {};
