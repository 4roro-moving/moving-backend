import type { AdminRole, UserRole } from "@prisma/client";
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

      /** requireActiveAdmin에서 조회한 AdminProfile. authorizeAdmin에서 재사용합니다. */
      adminProfile?: {
        adminRole: AdminRole;
      };
    }
  }
}

export {};
