import type {
  InquiryCategory,
  InquiryStatus,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "@prisma/client";
import type { z } from "zod";

import type { dashboardQuerySchema } from "./dashboard.validator";

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardPeriod = DashboardQuery["period"];

/** 회원 현황. 기간과 무관한 현재 상태 지표입니다. */
export type DashboardMemberSummary = {
  /** 탈퇴하지 않은 전체 회원 수 (관리자 제외) */
  totalCount: number;
  /** 활동 중인 기사 수 (정지·탈퇴·프로필 미완성 제외) */
  activeMoverCount: number;
  /** 기간 내 신규 가입 수 */
  newInPeriod: number;
};

/** 처리해야 할 항목. 관리자가 지금 봐야 하는 숫자입니다. */
export type DashboardPendingSummary = {
  /** 처리 대기(PENDING) 신고 수 */
  pendingReportCount: number;
  /** 답변 대기(OPEN) 문의 수 */
  openInquiryCount: number;
};

/** 서비스 운영 현황. 기간 한정 지표입니다. */
export type DashboardServiceSummary = {
  /** 기간 내 등록된 견적 요청 수 (임시저장 제외) */
  requestedCount: number;
  /** 기간 내 기사가 제출한 견적 수 */
  submittedCount: number;
  /** 기간 내 확정된 견적 수 */
  confirmedCount: number;
  /** 기간 내 완료 처리된 이사 수 */
  completedCount: number;
};

/** 콘텐츠 숨김 처리 현황. 관리자가 숨긴 누적 건수입니다. */
export type DashboardContentSummary = {
  hiddenReviewCount: number;
  hiddenResidenceReviewCount: number;
  hiddenGiveawayCount: number;
  /** 공지·FAQ 는 isVisible=false 를 숨김으로 봅니다. */
  hiddenNoticeCount: number;
  hiddenFaqCount: number;
};

export type DashboardRecentReport = {
  id: number;
  targetType: ReportTargetType;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: Date;
};

export type DashboardRecentInquiry = {
  id: number;
  category: InquiryCategory;
  title: string;
  status: InquiryStatus;
  createdAt: Date;
};

export type DashboardRecentActivity = {
  id: number;
  action: string;
  targetType: string;
  memo: string | null;
  createdAt: Date;
  actor: { name: string } | null;
};

export type DashboardSummary = {
  /** 응답에 되돌려 주어 화면이 "최근 N일 기준"을 표시할 수 있게 합니다. */
  period: DashboardPeriod;
  /** 기간 지표의 시작 시각 */
  since: Date;
  members: DashboardMemberSummary;
  pending: DashboardPendingSummary;
  service: DashboardServiceSummary;
  contents: DashboardContentSummary;
  recent: {
    reports: DashboardRecentReport[];
    inquiries: DashboardRecentInquiry[];
    activities: DashboardRecentActivity[];
  };
};
