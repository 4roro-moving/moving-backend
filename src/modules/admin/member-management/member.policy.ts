import { SuspensionAction } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { MEMBER_STATUS, type MemberStatus } from "./member-status.constants";

export function resolveMemberStatus(user: {
  isActive: boolean;
  deletedAt: Date | null;
}): MemberStatus {
  if (user.deletedAt !== null) {
    return MEMBER_STATUS.WITHDRAWN;
  }

  return user.isActive ? MEMBER_STATUS.ACTIVE : MEMBER_STATUS.SUSPENDED;
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
