import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

/** 최근 항목 카드에 노출하는 건수입니다. */
const RECENT_ITEM_LIMIT = 5;

/**
 * 대시보드 집계 쿼리 모음.
 *
 * ── 왜 raw SQL 인가 ────────────────────────────────────────────────────
 * 처음에는 Prisma count/groupBy 를 지표마다 호출했는데, 같은 테이블을
 * 여러 번 훑는 구조라 RDS 에서 대시보드 한 번에 33초가 걸렸다.
 *
 *   estimates GROUP BY status (30일치)                     12.3s
 *   estimates COUNT status='CONFIRMED' AND confirmed_at    20.1s
 *   User COUNT × 3회                                       각 1.3s
 *
 * 특히 두 번째가 문제였다. status 인덱스로 CONFIRMED 행을 전부 찾은 뒤
 * 각 행의 힙을 열어 confirmed_at 을 확인하느라 대량의 페이지를 읽는다.
 * 기간만큼만 필요한데 전체 기간을 뒤지는 셈이다.
 *
 * COUNT(*) FILTER 로 묶으면 WHERE 가 기간으로 한정되어 읽는 범위가 줄고,
 * 테이블당 스캔이 1회로 끝난다. 쿼리 수도 17개 → 6개로 줄어
 * 서울 리전 왕복 지연이 크게 감소한다.
 *
 * 집계 전용이라 Prisma 타입 추론을 일부 포기하는 대신,
 * 반환 타입을 명시해 호출부에서는 동일하게 타입 안전하게 쓴다.
 */

/** Postgres 의 COUNT 는 bigint 로 오므로 JS number 로 변환한다. */
function toNumber(value: bigint | number | null | undefined): number {
  return Number(value ?? 0);
}

type MemberSummaryRow = {
  totalCount: bigint;
  activeMoverCount: bigint;
  newInPeriod: bigint;
};

type PendingSummaryRow = {
  pendingReportCount: bigint;
  openInquiryCount: bigint;
};

type ContentSummaryRow = {
  hiddenReviewCount: bigint;
  hiddenResidenceReviewCount: bigint;
  hiddenGiveawayCount: bigint;
  hiddenNoticeCount: bigint;
  hiddenFaqCount: bigint;
};

export const dashboardRepository = {
  /**
   * 회원 현황.
   *
   * 전체·활동 기사·신규 가입을 한 번의 스캔으로 집계한다.
   * 개별 count 3회로는 같은 11만 행을 세 번 훑게 된다.
   */
  async findMemberSummary(since: Date, db: DbClient = prisma) {
    const rows = await db.$queryRaw<MemberSummaryRow[]>`
      SELECT
        COUNT(*) AS "totalCount",
        COUNT(*) FILTER (
          WHERE "role" = 'MOVER'
            AND "isActive" = true
            AND "isProfileCompleted" = true
        ) AS "activeMoverCount",
        COUNT(*) FILTER (WHERE "createdAt" >= ${since}) AS "newInPeriod"
      FROM "User"
      WHERE "role" IN ('CUSTOMER', 'MOVER')
        AND "deletedAt" IS NULL
    `;

    const row = rows[0];

    return {
      totalCount: toNumber(row?.totalCount),
      activeMoverCount: toNumber(row?.activeMoverCount),
      newInPeriod: toNumber(row?.newInPeriod),
    };
  },

  /**
   * 처리 대기 건수. 기간과 무관하게 현재 미처리 상태를 센다.
   *
   * 서로 다른 테이블이라 스캔은 나뉘지만 스칼라 서브쿼리로 묶어
   * 왕복을 1회로 줄인다. 두 테이블 모두 status 인덱스를 탄다.
   */
  async findPendingSummary(db: DbClient = prisma) {
    const rows = await db.$queryRaw<PendingSummaryRow[]>`
      SELECT
        (SELECT COUNT(*) FROM "reports" WHERE "status" = 'PENDING') AS "pendingReportCount",
        (SELECT COUNT(*) FROM "inquiries" WHERE "status" = 'OPEN') AS "openInquiryCount"
    `;

    const row = rows[0];

    return {
      pendingReportCount: toNumber(row?.pendingReportCount),
      openInquiryCount: toNumber(row?.openInquiryCount),
    };
  },

  /**
   * 견적 요청 현황 (기간 한정).
   *
   * PENDING(임시저장)은 기사에게 노출된 적이 없으므로 요청 집계에서 뺀다.
   * 완료는 completedAt 기준이어야 한다 — 이사 완료는 요청 생성보다 한참
   * 뒤에 찍히므로 createdAt 으로 세면 최근 완료 건이 누락된다.
   *
   * WHERE 를 두 시각의 합집합으로 두면 스캔 범위가 기간으로 한정된다.
   */
  async findRequestSummary(since: Date, db: DbClient = prisma) {
    /*
     * 두 지표를 OR 로 한 쿼리에 묶어봤지만 플래너가 인덱스를 포기하고
     * Seq Scan 으로 떨어져 오히려 7배 느렸다(측정: 55ms → 385ms).
     * 각각 자기 인덱스를 타도록 분리해 병렬로 실행한다.
     */
    const [requestedRows, completedRows] = await Promise.all([
      db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS "count"
        FROM "estimate_requests"
        WHERE "createdAt" >= ${since} AND "status" <> 'PENDING'
      `,
      db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS "count"
        FROM "estimate_requests"
        WHERE "status" = 'COMPLETED' AND "completedAt" >= ${since}
      `,
    ]);

    return {
      requestedCount: toNumber(requestedRows[0]?.count),
      completedCount: toNumber(completedRows[0]?.count),
    };
  },

  /**
   * 견적 현황 (기간 한정).
   *
   * 제출은 createdAt, 확정은 confirmedAt 기준이다.
   * 두 조건을 OR 로 묶어 한 번만 스캔한다. 분리하면 확정 집계가
   * CONFIRMED 전체 행의 힙을 뒤지게 되어 이 쿼리 하나가 20초를 먹는다.
   */
  async findEstimateSummary(since: Date, db: DbClient = prisma) {
    /*
     * 확정 집계가 20초를 먹던 원인은 status 인덱스로 CONFIRMED 행을 전부 찾은 뒤
     * 각 행의 힙을 열어 confirmed_at 을 확인했기 때문이다.
     * estimates_confirmed_at_idx 부분 인덱스를 추가하면 Index Only Scan 이 되어
     * 힙 접근이 사라진다(측정: 20s → 4ms).
     *
     * OR 로 한 쿼리에 묶는 방식은 Seq Scan 을 유발해 오히려 느리다.
     */
    const [submittedRows, confirmedRows] = await Promise.all([
      db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS "count"
        FROM "estimates"
        WHERE "created_at" >= ${since}
      `,
      db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS "count"
        FROM "estimates"
        WHERE "status" = 'CONFIRMED' AND "confirmed_at" >= ${since}
      `,
    ]);

    return {
      submittedCount: toNumber(submittedRows[0]?.count),
      confirmedCount: toNumber(confirmedRows[0]?.count),
    };
  },

  /**
   * 콘텐츠 숨김 처리 현황 (누적).
   *
   * 리뷰·거주후기·나눔은 isHidden, 공지·FAQ 는 isVisible=false 를 숨김으로 본다.
   * 테이블은 5개지만 스칼라 서브쿼리로 묶어 왕복을 1회로 줄인다.
   */
  async findContentSummary(db: DbClient = prisma) {
    const rows = await db.$queryRaw<ContentSummaryRow[]>`
      SELECT
        (SELECT COUNT(*) FROM "reviews" WHERE "is_hidden" = true) AS "hiddenReviewCount",
        (SELECT COUNT(*) FROM "residence_reviews" WHERE "is_hidden" = true) AS "hiddenResidenceReviewCount",
        (SELECT COUNT(*) FROM "giveaways" WHERE "is_hidden" = true) AS "hiddenGiveawayCount",
        (SELECT COUNT(*) FROM "notices" WHERE "is_visible" = false) AS "hiddenNoticeCount",
        (SELECT COUNT(*) FROM "faqs" WHERE "is_visible" = false) AS "hiddenFaqCount"
    `;

    const row = rows[0];

    return {
      hiddenReviewCount: toNumber(row?.hiddenReviewCount),
      hiddenResidenceReviewCount: toNumber(row?.hiddenResidenceReviewCount),
      hiddenGiveawayCount: toNumber(row?.hiddenGiveawayCount),
      hiddenNoticeCount: toNumber(row?.hiddenNoticeCount),
      hiddenFaqCount: toNumber(row?.hiddenFaqCount),
    };
  },

  /**
   * 최근 항목 목록.
   *
   * 신고·문의는 미처리를 우선 노출한다. 최신순으로만 뽑으면
   * 오래된 미처리 건이 목록 밖으로 밀려 관리자가 놓치게 된다.
   *
   * 이 셋은 LIMIT 5 라 스캔량이 작아 Prisma API 를 그대로 쓴다.
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
        // PENDING < RESOLVED < REJECTED 순서라 오름차순이면 미처리가 먼저다
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
