/*
 * 리뷰 시드 (레거시 제거 완료 · scenarioSeeds 로 통합)
 *
 * seedReviews 는 REVIEW_SEED_ITEMS 의 { key, rating, content } 만 사용한다.
 * scenarioSeeds 의 SCENARIO_REVIEWS 가 그 형태를 그대로 제공한다.
 *   - rating/content 있음 → 고객이 작성한 리뷰
 *   - rating/content null → 작성 가능한(미작성) 리뷰
 */

import { SCENARIO_REVIEWS, type ScenarioReview } from "./scenarioSeeds.js";

export type ReviewSeedItem = ScenarioReview;

export const REVIEW_SEED_ITEMS: readonly ReviewSeedItem[] = SCENARIO_REVIEWS;
