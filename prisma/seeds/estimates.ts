/*
 * 견적 시드 (레거시 하드코딩 제거 완료)
 *
 * 모든 견적은 scenarioSeeds 에서 생성된다.
 *  - 완료 이사의 CONFIRMED 견적(리뷰 연결)
 *  - 현재 QUOTED 그룹의 SENT 견적
 */

import { SCENARIO_ESTIMATES } from "./scenarioSeeds.js";

interface EstimateSeed {
  requestKey: string;
  moverEmail: string;
  price: number;
  comment: string;
  status: "SENT" | "CONFIRMED";
  isDesignated: boolean;
}

export const ESTIMATES: readonly EstimateSeed[] = SCENARIO_ESTIMATES;
