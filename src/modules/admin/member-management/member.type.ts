import type {
  AuthProvider,
  InquiryCategory,
  InquiryStatus,
  SuspensionAction,
} from "@prisma/client";

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
  /** 관리자의 답변을 기다리는 OPEN 상태 1:1 문의 건수입니다. */
  openInquiryCount: number;
  createdAt: Date;
};

/** 회원 목록에서 제공하는 피신고·회원이 접수한 미처리 문의 집계입니다. */
export type MemberReceivedReportCounts = {
  receivedReportCount: number;
  pendingReceivedReportCount: number;
  openInquiryCount: number;
};

/** 회원이 작성한 1:1 문의의 목록 항목입니다. */
export type MemberInquiryHistoryItem = {
  id: number;
  category: InquiryCategory;
  title: string;
  status: InquiryStatus;
  lastMessageAt: Date | null;
  createdAt: Date;
  handledBy: {
    name: string;
  } | null;
};

/** 회원 상세에서 제공하는 미처리 우선 1:1 문의 이력입니다. */
export type MemberInquiryHistory = {
  totalCount: number;
  openCount: number;
  items: MemberInquiryHistoryItem[];
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
  internalNote: string | null;
  createdAt: Date;
  admin: {
    name: string;
  };
};
