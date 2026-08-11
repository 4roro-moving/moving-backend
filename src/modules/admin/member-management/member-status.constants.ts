/**
 * User.isActive와 deletedAt 조합으로 계산하는 회원 상태
 * Prisma 모델의 enum이 아니므로 관리자 회원 관리(일반 유저/기사) 모듈에서 공통으로 관리
 */
export const MEMBER_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  WITHDRAWN: "WITHDRAWN",
} as const;

export const MEMBER_STATUSES = [
  MEMBER_STATUS.ACTIVE,
  MEMBER_STATUS.SUSPENDED,
  MEMBER_STATUS.WITHDRAWN,
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];
