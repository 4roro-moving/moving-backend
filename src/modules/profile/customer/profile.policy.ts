import { UserRole } from "@prisma/client";

import { AppError } from "../../../lib/app-error";

export const assertActiveCustomer = <
  T extends {
    isActive: boolean;
    deletedAt: Date | null;
    role: UserRole;
  },
>(
  user: T | null,
): T => {
  if (!user) {
    throw new AppError("NOT_FOUND", {
      message: "사용자를 찾을 수 없습니다.",
    });
  }

  if (!user.isActive || user.deletedAt !== null) {
    throw new AppError("FORBIDDEN", {
      message: "비활성화된 사용자입니다.",
    });
  }

  if (user.role !== UserRole.CUSTOMER) {
    throw new AppError("FORBIDDEN", {
      message: "일반 사용자만 이용할 수 있습니다.",
    });
  }

  return user;
};
