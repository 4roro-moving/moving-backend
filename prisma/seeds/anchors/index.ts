/*
 * 앵커(고정 QA) 계정
 * ============================================================================
 *
 *  1~100번 계정은 통계 분포가 아니라 "정해진 시나리오"를 갖는다.
 *  QA 문서·수동 테스트·기존 팀 관행이 이 번호에 의존하고 있으므로
 *  벌크 데이터와 분리해서 계약처럼 고정한다.
 *
 *  이메일은 3자리 zero-padding 이다: customer001@test.com
 *  (문자열 정렬 == 번호 정렬이 되도록. 관리자 화면이 email asc 로 정렬한다)
 *
 *  ── 배치 내 위치(끝자리 1~10)별 케이스 ──────────────────────────────
 *    1~2  : 신규 계정 — 진행 요청도 과거 이력도 없음
 *    3~4  : REQUESTED — OPEN 요청만 있고 견적 대기
 *    5~6  : QUOTED    — OPEN 요청 + 기사 SENT 견적 도착
 *    7~8  : QUOTED    — (+ 과거 미작성 리뷰 보유)
 *    9    : QUOTED    — 계정 정지 상태
 *    10   : QUOTED    — 정지 → 해제 이력 보유, 현재 active
 * ============================================================================
 */

import { GROUP_SIZE } from "../config.js";

export type AnchorPhase = "NONE" | "REQUESTED" | "QUOTED";

export function customerNo(index: number): string {
  return String(index).padStart(3, "0");
}

export function customerEmail(index: number): string {
  return `customer${customerNo(index)}@test.com`;
}

export function moverEmail(index: number): string {
  return `mover${customerNo(index)}@test.com`;
}

export function adminEmail(index: number): string {
  return `admin${index}@test.com`;
}

/** 1-based 배치 내 위치 (1~10) */
export function positionInBatch(index: number): number {
  return ((index - 1) % GROUP_SIZE) + 1;
}

export function phaseForAnchor(index: number): AnchorPhase {
  const pos = positionInBatch(index);

  if (pos <= 2) {
    return "NONE";
  }

  if (pos <= 4) {
    return "REQUESTED";
  }

  return "QUOTED";
}

/** 과거 완료 이사 이력을 갖는가? (1~2번 신규 계정 제외) */
export function hasHistory(index: number): boolean {
  return positionInBatch(index) > 2;
}

/** 현재 정지 상태인 계정인가? (배치 내 9번) */
export function isSuspended(index: number): boolean {
  return positionInBatch(index) === 9;
}

/** 정지 → 해제 이력을 갖는 계정인가? (배치 내 10번) */
export function isReleased(index: number): boolean {
  return positionInBatch(index) === 10;
}

/** 앵커 고객이 갖는 과거 이력 구성 */
export const ANCHOR_REVIEWS_WRITTEN = 3;
export const ANCHOR_REVIEWS_PENDING = 3;

/**
 * 채팅 테스트 전용 계정.
 *
 * 기존 시드가 customer017 / mover017 을 하드코딩하고 있었다.
 * 그 관행을 유지하되, 하드코딩이 아니라 명시적 계약으로 승격한다.
 */
export const CHAT_TEST_CUSTOMER_INDEX = 17;
export const CHAT_TEST_MOVER_INDEX = 17;
export const CHAT_TEST_MESSAGE_COUNT = 90;
