/*
 * 견적 요청 시드 (레거시 하드코딩 제거 완료)
 *
 * 모든 요청은 scenarioSeeds 의 결정적 규칙으로 생성된다.
 *  - 과거 완료 이사(작성/미작성 리뷰용 COMPLETED)
 *  - 현재 진행 상태(그룹별 BEFORE/REQUESTED/QUOTED)
 */

import { SCENARIO_REQUESTS } from "./scenarioSeeds.js";

export const ESTIMATE_REQUESTS = SCENARIO_REQUESTS;

export type EstimateRequestSeedKey = string;
