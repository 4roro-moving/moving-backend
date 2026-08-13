import type { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../modules/auth/auth.type";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;

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
