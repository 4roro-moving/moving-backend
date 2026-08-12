import { resolveMemberStatus } from "./member.policy";
import type { MemberDetailAccount, MemberListBase } from "./member.type";

/** 고객·기사 목록 응답에서 공통으로 사용하는 계정 필드를 변환합니다. */
export function toMemberListBase(member: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  isProfileCompleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
}): MemberListBase {
  return {
    id: member.id,
    email: member.email,
    name: member.name,
    phone: member.phone,
    status: resolveMemberStatus(member),
    isProfileCompleted: member.isProfileCompleted,
    createdAt: member.createdAt,
  };
}

/** 고객·기사 상세 응답에서 공통으로 사용하는 계정 정보를 변환합니다. */
export function toMemberDetailAccount(member: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  authProvider: MemberDetailAccount["authProvider"];
  isActive: boolean;
  isProfileCompleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): MemberDetailAccount {
  return {
    id: member.id,
    email: member.email,
    name: member.name,
    phone: member.phone,
    authProvider: member.authProvider,
    status: resolveMemberStatus(member),
    isProfileCompleted: member.isProfileCompleted,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}
