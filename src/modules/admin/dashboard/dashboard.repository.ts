import { EstimateRequestStatus, EstimateStatus, InquiryStatus, ReportStatus } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

/** 최근 항목 카드에 노출하는 건수입니다. */
const RECENT_ITEM_LIMIT = 5;

/**
 * 대시보드 집계 쿼리 모음.
 *
 * ── 설계 메모 ──────────────────────────────────────────────────────────
 * 상태별 건수는 status 마다 count() 를 부르지 않고 groupBy 로 한 번에 가져온다.
 * 같은 테이블을 상태 수만큼 반복 스캔하는 것을 피하기 위함이다.
 * (로컬 169만행 기준 개별 4회 175ms → groupBy 1회 48ms)
 *
 * 기간 지표는 created_at 인덱스로 범위를 잘라내므로 전체 데이터가 쌓여도
 * 스캔량이 늘지 않는다. 7일치는 169만 중 약 1.7만 행(1%)이다.
 */
export const dashboardRepository = {
  /** 회원 현황. 관리자 계정은 집계에서 제외한다. */
  async findMemberSummary(since: Date, db: DbClient = prisma) {
    const [totalCount, activeMoverCount, newInPeriod] = await Promise.all([
      db.user.count({
        where: { role: { in: ["CUSTOMER", "MOVER"] }, deletedAt: null },
      }),
      db.user.count({
        where: {
          role: "MOVER",
          deletedAt: null,
          isActive: true,
          isProfileCompleted: true,
        },
      }),
      db.user.count({
        where: {
          role: { in: ["CUSTOMER", "MOVER"] },
          deletedAt: null,
          createdAt: { gte: since },
        },
      }),
    ]);

    return { totalCount, activeMoverCount, newInPeriod };
  },

  /** 처리 대기 건수. 기간과 무관하게 현재 미처리 상태를 센다. */
  async findPendingSummary(db: DbClient = prisma) {
    const [pendingReportCount, openInquiryCount] = await Promise.all([
      db.report.count({ where: { status: ReportStatus.PENDING } }),
      db.inquiry.count({ where: { status: InquiryStatus.OPEN } }),
    ]);

    return { pendingReportCount, openInquiryCount };
  },

  /**
   * 서비스 운영 현황 (기간 한정).
   *
   * 견적 요청은 상태별로 groupBy 한 뒤 서비스에서 조합한다.
   * PENDING(임시저장)은 사용자에게 노출된 적이 없으므로 "요청"에서 제외한다.
   */
  async findServiceSummary(since: Date, db: DbClient = prisma) {
    const [requestGroups, estimateGroups] = await Promise.all([
      db.estimateRequest.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      db.estimate.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    /*
     * 이사 완료는 "기간 내 생성된 요청 중 완료된 것"이 아니라
     * "기간 내 완료 처리된 건"이어야 한다. 완료는 이사일 이후에 찍히므로
     * createdAt 기준으로 세면 최근 완료 건이 누락된다.
     */
    const completedCount = await db.estimateRequest.count({
      where: {
        status: EstimateRequestStatus.COMPLETED,
        completedAt: { gte: since },
      },
    });

    /*
     * 확정도 마찬가지로 confirmedAt 기준으로 센다.
     * 견적 제출과 확정 사이에 시차가 있기 때문이다.
     */
    const confirmedCount = await db.estimate.count({
      where: {
        status: EstimateStatus.CONFIRMED,
        confirmedAt: { gte: since },
      },
    });

    return { requestGroups, estimateGroups, completedCount, confirmedCount };
  },

  /**
   * 콘텐츠 숨김 처리 현황.
   *
   * 리뷰·거주후기·나눔은 isHidden, 공지·FAQ 는 isVisible=false 를 숨김으로 본다.
   * 누적 건수라 기간을 적용하지 않는다.
   */
  async findContentSummary(db: DbClient = prisma) {
    const [
      hiddenReviewCount,
      hiddenResidenceReviewCount,
      hiddenGiveawayCount,
      hiddenNoticeCount,
      hiddenFaqCount,
    ] = await Promise.all([
      db.review.count({ where: { isHidden: true } }),
      db.residenceReview.count({ where: { isHidden: true } }),
      db.giveaway.count({ where: { isHidden: true } }),
      db.notice.count({ where: { isVisible: false } }),
      db.faq.count({ where: { isVisible: false } }),
    ]);

    return {
      hiddenReviewCount,
      hiddenResidenceReviewCount,
      hiddenGiveawayCount,
      hiddenNoticeCount,
      hiddenFaqCount,
    };
  },

  /**
   * 최근 항목 목록.
   *
   * 신고·문의는 미처리를 우선 노출한다. 최신순으로만 뽑으면
   * 오래된 미처리 건이 목록 밖으로 밀려 관리자가 놓치게 된다.
   */
  async findRecentItems(db: DbClient = prisma) {
    const [reports, inquiries, activities] = await Promise.all([
      db.report.findMany({
        select: {
          id: true,
          targetType: true,
          reason: true,
          status: true,
          createdAt: true,
        },
        // PENDING 이 먼저 오도록 status 오름차순(PENDING < RESOLVED < REJECTED)
        orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "desc" }],
        take: RECENT_ITEM_LIMIT,
      }),
      db.inquiry.findMany({
        select: {
          id: true,
          category: true,
          title: true,
          status: true,
          createdAt: true,
        },
        // OPEN < ANSWERED < CLOSED 순서라 오름차순이면 미답변이 먼저다
        orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }, { id: "desc" }],
        take: RECENT_ITEM_LIMIT,
      }),
      db.activityLog.findMany({
        where: { actorRole: "ADMIN" },
        select: {
          id: true,
          action: true,
          targetType: true,
          memo: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: RECENT_ITEM_LIMIT,
      }),
    ]);

    return { reports, inquiries, activities };
  },
};
