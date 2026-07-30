import type { Prisma } from "@prisma/client";

// 노출 가능한 활성 기사 User 조건
export function buildActiveMoverUserWhere(): Prisma.UserWhereInput {
  return {
    role: "MOVER",
    isActive: true,
    isProfileCompleted: true,
    deletedAt: null,
  };
}
