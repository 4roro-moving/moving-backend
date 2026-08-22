import { z } from "zod";

/**
 * 대시보드 집계 기간.
 *
 * 기간 한정 지표(견적 요청/개설/확정/이사 완료)에만 적용됩니다.
 * 전체 회원 수나 처리 대기 건수처럼 "현재 상태"를 나타내는 지표는
 * 기간과 무관하게 전체를 집계합니다.
 */
export const DASHBOARD_PERIODS = ["7d", "30d", "90d"] as const;

export const DEFAULT_DASHBOARD_PERIOD = "7d";

/** 기간별 일수. resolveSince 에서 기준 시각을 계산할 때 사용합니다. */
export const DASHBOARD_PERIOD_DAYS: Record<(typeof DASHBOARD_PERIODS)[number], number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const dashboardQuerySchema = z.object({
  period: z
    .enum(DASHBOARD_PERIODS, { error: "올바른 집계 기간이 아닙니다." })
    .default(DEFAULT_DASHBOARD_PERIOD),
});
