import type { AuthProvider, SuspensionAction } from "@prisma/client";

import type { MemberStatus } from "./member-status.constants";

/** 이력 목록의 최신 항목과 전체 건수를 함께 반환하는 공통 구조입니다. */
export type HistorySummary<T> = {
  totalCount: number;
  items: T[];
};

/** 고객·기사 목록 응답에서 공통으로 제공하는 계정 요약입니다. */
export type MemberListBase = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: MemberStatus;
  isProfileCompleted: boolean;
  receivedReportCount: number;
  pendingReceivedReportCount: number;
  createdAt: Date;
};

/** 회원이 피신고된 전체·미처리 신고 집계입니다. */
export type MemberReceivedReportCounts = {
  receivedReportCount: number;
  pendingReceivedReportCount: number;
};

/** 고객·기사 상세 응답에서 공통으로 제공하는 계정 정보입니다. */
export type MemberDetailAccount = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  authProvider: AuthProvider;
  status: MemberStatus;
  isProfileCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** 관리자에 의한 회원 정지·해제 이력의 공통 항목입니다. */
export type MemberSuspensionHistoryItem = {
  id: number;
  action: SuspensionAction;
  reason: string;
  createdAt: Date;
};
