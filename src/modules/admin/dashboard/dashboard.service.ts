import { dashboardRepository } from "./dashboard.repository";
import type { DashboardPeriod, DashboardQuery, DashboardSummary } from "./dashboard.type";
import { DASHBOARD_PERIOD_DAYS } from "./dashboard.validator";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 대시보드 응답 캐시 TTL.
 *
 * 관리자가 여러 명이거나 새로고침을 반복해도 이 주기 안에서는 DB 를 다시 치지 않는다.
 * 배치(스케줄러 + 스냅샷 테이블) 대신 이 방식을 쓰는 이유는 아래와 같다.
 *
 *   · 기간 지표는 시각 인덱스로 범위를 잘라내므로 데이터가 쌓여도 스캔량이 늘지 않는다.
 *     7일 창의 크기는 전체 데이터 총량이 아니라 주간 유입량이 결정한다.
 *   · 배치는 데이터가 최대 주기만큼 낡는다. "처리 대기 신고 12건" 인데 실제로는
 *     30건인 상황은 관리자 도구에서 치명적이다.
 *   · 스케줄러·스냅샷 테이블·실패 감지·재실행 로직이 모두 새로 필요하다.
 *
 * 응답이 계속 느리거나 DB 부하가 눈에 띄면 TTL 을 늘리거나 Redis 로 옮긴다.
 */
const CACHE_TTL_MS = 60_000;

type CacheEntry = { data: DashboardSummary; cachedAt: number };

/*
 * 프로세스 메모리 캐시.
 * EC2 를 여러 대로 늘리면 인스턴스마다 캐시를 따로 갖게 되므로,
 * 그 시점에는 Redis 같은 공유 저장소로 옮겨야 한다.
 */
const cacheByPeriod = new Map<DashboardPeriod, CacheEntry>();

/** 기간 시작 시각. period 가 7d 면 지금으로부터 7일 전. */
function resolveSince(period: DashboardPeriod, now: Date): Date {
  return new Date(now.getTime() - DASHBOARD_PERIOD_DAYS[period] * MS_PER_DAY);
}

async function computeDashboard(period: DashboardPeriod, now: Date): Promise<DashboardSummary> {
  const since = resolveSince(period, now);

  /*
   * 순차 실행하면 각 집계 시간이 그대로 더해진다.
   * 병렬이면 가장 느린 하나로 수렴하므로 응답이 크게 짧아진다.
   */
  const [members, pending, requests, estimates, contents, recent] = await Promise.all([
    dashboardRepository.findMemberSummary(since),
    dashboardRepository.findPendingSummary(),
    dashboardRepository.findRequestSummary(since),
    dashboardRepository.findEstimateSummary(since),
    dashboardRepository.findContentSummary(),
    dashboardRepository.findRecentItems(),
  ]);

  return {
    period,
    since,
    members,
    pending,
    service: {
      requestedCount: requests.requestedCount,
      submittedCount: estimates.submittedCount,
      confirmedCount: estimates.confirmedCount,
      completedCount: requests.completedCount,
    },
    contents,
    recent,
  };
}

export const dashboardService = {
  /**
   * 관리자 대시보드 요약을 조회합니다.
   *
   * 기간 지표(견적 요청/개설/확정/이사 완료, 신규 가입)에만 period 가 적용되고,
   * 회원 수·처리 대기 건수·콘텐츠 숨김 수는 현재 상태 전체를 집계합니다.
   */
  async getDashboard(query: DashboardQuery): Promise<DashboardSummary> {
    const { period } = query;
    const now = new Date();

    const cached = cacheByPeriod.get(period);

    if (cached && now.getTime() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.data;
    }

    const data = await computeDashboard(period, now);

    cacheByPeriod.set(period, { data, cachedAt: now.getTime() });

    return data;
  },

  /** 테스트에서 캐시 상태가 다음 케이스로 새지 않도록 비웁니다. */
  clearCache(): void {
    cacheByPeriod.clear();
  },
};
