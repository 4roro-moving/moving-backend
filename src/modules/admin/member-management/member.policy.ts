import { SuspensionAction } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { MEMBER_STATUS, type MemberStatus } from "./member-status.constants";

/**
 * User.isActive와 deletedAt 조합으로 관리자 회원의 표시 상태를 계산합니다.
 * 탈퇴는 이용 정지보다 우선하므로 deletedAt을 먼저 확인합니다.
 */
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

/** 목록 조회에서 프로필 완료 여부가 지정된 경우에만 Prisma 조건을 만듭니다. */
export function buildProfileCompletedWhere(
  isProfileCompleted: boolean | undefined,
): Prisma.UserWhereInput {
  return isProfileCompleted === undefined ? {} : { isProfileCompleted };
}

/** 관리자는 자기 자신의 계정 상태를 정지·해제할 수 없습니다. */
export function assertAdminCanChangeMemberStatus(memberId: string, adminId: string): void {
  if (memberId === adminId) {
    throw new AppError("SELF_ACTION_NOT_ALLOWED");
  }
}

/** 정지·해제 동작을 User.isActive에 저장할 값으로 변환합니다. */
export function resolveIsActiveForSuspensionAction(action: SuspensionAction): boolean {
  return action === SuspensionAction.RELEASE;
}
