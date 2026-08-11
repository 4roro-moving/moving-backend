import { UserRole } from "@prisma/client";

import { AppError } from "../../../lib/app-error";

export const assertActiveMover = <
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
      message: "비활성화되었거나 탈퇴 처리된 계정입니다.",
    });
  }

  if (user.role !== UserRole.MOVER) {
    throw new AppError("FORBIDDEN", {
      message: "기사님만 이용할 수 있습니다.",
    });
  }

  return user;
};
