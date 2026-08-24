import type { AdminRole, UserRole } from "@prisma/client";
import type { InquiryAccess } from "../constants/inquiry-access";
import type { AuthenticatedUser } from "../modules/auth/auth.type";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      /** 문의 API에서만 설정하는 정지 이의 제기 제한 세션 여부. */
      inquiryAccess?: InquiryAccess;

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
