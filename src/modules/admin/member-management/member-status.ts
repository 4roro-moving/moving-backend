import type { Prisma } from "@prisma/client";

import { MEMBER_STATUS, type MemberStatus } from "./member-status.constants";

/** User.isActive와 deletedAt 조합으로 관리자 회원의 표시 상태를 계산합니다. */
export function resolveMemberStatus(user: {
  isActive: boolean;
  deletedAt: Date | null;
}): MemberStatus {
  if (user.deletedAt !== null) {
    return MEMBER_STATUS.WITHDRAWN;
  }

  return user.isActive ? MEMBER_STATUS.ACTIVE : MEMBER_STATUS.SUSPENDED;
}

/** 관리자 회원 목록의 상태 필터를 Prisma User where 조건으로 변환합니다. */
export function buildMemberStatusWhere(status: MemberStatus | undefined): Prisma.UserWhereInput {
  if (status === MEMBER_STATUS.ACTIVE) {
    return { deletedAt: null, isActive: true };
  }

  if (status === MEMBER_STATUS.SUSPENDED) {
    return { deletedAt: null, isActive: false };
  }

  if (status === MEMBER_STATUS.WITHDRAWN) {
    return { deletedAt: { not: null } };
  }

  // 미지정 시 탈퇴 회원(WITHDRAWN) 제외
  return { deletedAt: null };
}
