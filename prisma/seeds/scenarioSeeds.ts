/*
 * ============================================================================
 *  통합 시나리오 시드 생성기 (single source of truth)
 * ============================================================================
 *
 *  기존에 흩어져 있던 하드코딩 레거시(customer1-open-request 등)를 전부 제거하고,
 *  고객/기사 번호에 대한 결정적(deterministic) 규칙으로 모든 견적요청·견적·리뷰를
 *  한 곳에서 생성한다. 시드를 몇 번 돌려도 동일한 결과가 나온다(랜덤 시드 고정).
 *
 *  ── 배치 내 위치별 케이스 (각 10명 배치, 100번까지 반복) ──────────────────
 *   각 10명 배치의 "위치(끝자리 1~10)"로 테스트 케이스를 고정 분배한다.
 *     위치 1~2 : 새 계정 — 진행 요청도, 과거 이력도 없음
 *     위치 3~4 : REQUESTED — OPEN 요청만, 견적 대기(내가 견적요청)
 *     위치 5~6 : QUOTED   — OPEN 요청 + 기사 SENT 견적 도착
 *     위치 7~8 : QUOTED   — (+ 과거 미작성 리뷰 보유, 다른 계정과 동일)
 *     위치 9   : QUOTED   — 계정은 정지 상태 (seedAdminContents)
 *     위치 10  : QUOTED   — 정지 → 해제 이력 보유, 현재는 active (seedAdminContents)
 *
 *  ── 과거 이력(완료 이사 + 리뷰) ───────────────────────────────────────────
 *   위치 1~2(새 계정)를 제외한 모든 고객은 과거 완료 이사를 가진다.
 *     · 작성한 리뷰      : 고객당 3건 (COMPLETED + CONFIRMED + Review 존재)
 *     · 작성 가능한 리뷰 : 고객당 3건 (COMPLETED + CONFIRMED + Review 없음)
 *
 *  ── 기사 리뷰 분포 ────────────────────────────────────────────────────────
 *   기사당 받은 리뷰 수가 0~50개 사이가 되도록 별도 완료이사+리뷰를 채운다.
 *   (아래 buildMoverReviewQuota, appendMoverReviewFill 참고)
 * ============================================================================
 */

import { CUSTOMER_COUNT, customerEmail } from "./customers.js";
import { MOVER_COUNT, moverEmail } from "./movers.js";

/* ── 결정적 난수 (mulberry32) : 시드 고정으로 재현성 보장 ── */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;

  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

function scenarioMover(offset: number): string {
  const idx = (Math.abs(offset) % MOVER_COUNT) + 1;

  return moverEmail(idx);
}

/* ── 공통 상수 ── */
const MOVE_TYPES = ["SMALL", "HOME", "OFFICE"] as const;
export type ScenarioMoveType = (typeof MOVE_TYPES)[number];

export const REVIEWS_WRITTEN_PER_CUSTOMER = 3; // 고객이 작성한 리뷰
export const REVIEWS_PENDING_PER_CUSTOMER = 3; // 고객이 작성 가능한(미작성) 리뷰
export const GROUP_SIZE = 10;

const REVIEW_CONTENTS = [
  "듣던대로 정말 친절하시고 물건도 잘 옮겨주셨어요! 다음에 또 부탁드릴게요.",
  "비 오는데도 꼼꼼히 잘 해주셔서 감사드립니다.",
  "시간 약속을 잘 지켜주셔서 좋았어요.",
  "포장이 꼼꼼해서 파손 없이 이사 완료했습니다.",
  "응대가 빠르고 설명이 친절했어요.",
  "짐이 많았는데도 체계적으로 잘 진행해 주셨습니다.",
  "견적 안내가 명확했고 추가 비용 없이 진행되어 만족했습니다.",
  "가구 배치까지 꼼꼼히 도와주셔서 편했습니다.",
] as const;

const QUOTE_COMMENTS = [
  "요청하신 일정에 맞춰 안전하게 진행하겠습니다.",
  "포장부터 운반까지 꼼꼼하게 도와드리겠습니다.",
  "합리적인 가격으로 신속하게 처리해드리겠습니다.",
  "경력을 살려 파손 없이 이사해드리겠습니다.",
] as const;

/*
 * 채팅 진입 테스트용 코멘트 (PR #104 의도 통합).
 * QUOTED 계정의 지정 견적(첫 견적)에 사용해, "SENT 견적이 도착해 채팅 조율이
 * 가능한 상태"를 명확히 표현한다.
 */
const CHAT_SENT_ESTIMATE_COMMENTS = [
  "채팅 기능 확인을 위해 조율 가능한 보낸 견적입니다.",
  "일정과 주소를 확인했고 안전하게 진행 가능한 견적입니다.",
  "견적 조율과 채팅 진입 테스트를 위한 미완료 견적입니다.",
] as const;

/* ── 공통 주소(지역은 seedRegions에 존재하는 값만 사용) ── */
const FROM = {
  region: "서울",
  zip: "06236",
  address: "서울특별시 강남구 테헤란로 123",
} as const;
const TO = {
  region: "경기",
  zip: "13529",
  address: "경기도 성남시 분당구 판교역로 166",
} as const;

/* ── 산출 타입 (seedEstimateData 계약과 일치) ── */
export interface ScenarioRequest {
  key: string;
  customerEmail: string;
  moveType: ScenarioMoveType;
  moveDateOffsetDays: number;
  expiresInDays: number;
  fromRegion: string;
  fromZipCode: string;
  fromAddress: string;
  fromDetailAddress: string;
  toRegion: string;
  toZipCode: string;
  toAddress: string;
  toDetailAddress: string;
  status: "OPEN" | "PENDING" | "COMPLETED";
  isActive: boolean;
}

export interface ScenarioEstimate {
  requestKey: string;
  moverEmail: string;
  price: number;
  comment: string;
  status: "SENT" | "CONFIRMED";
  isDesignated: boolean;
}

/** 리뷰 메타: rating/content 가 있으면 작성됨, null 이면 미작성(작성 가능) */
export interface ScenarioReview {
  key: string; // 대응하는 요청 key
  customerEmail: string;
  moverEmail: string;
  rating: number | null;
  content: string | null;
}

/* ── 현재 진행 상태 배정 (배치 내 위치 기반) ── */
export type CurrentPhase = "NONE" | "REQUESTED" | "QUOTED";

/*
 * 각 10명 배치 안의 위치(끝자리)로 케이스를 고정 분배한다. 100번까지 반복.
 *   위치 1~2 : NONE      (새 계정 — 진행 요청도, 과거 이력도 없음)
 *   위치 3~4 : REQUESTED (내가 요청만, 견적 대기)
 *   위치 5~6 : QUOTED    (기사 견적 도착)
 *   위치 7~8 : QUOTED    (+ 과거 미작성 리뷰 보유 — 다른 계정과 동일)
 *   위치 9   : QUOTED    (계정 자체는 정지: seedAdminContents 에서 처리)
 *   위치 10  : QUOTED    (정지 → 해제 이력 보유, 현재는 active: seedAdminContents)
 */
export function positionInBatch(index: number): number {
  // 1~10 반환 (1-based)
  return ((index - 1) % GROUP_SIZE) + 1;
}

export function phaseForCustomer(index: number): CurrentPhase {
  const pos = positionInBatch(index);

  if (pos <= 2) {
    return "NONE";
  }
  if (pos <= 4) {
    return "REQUESTED";
  }
  return "QUOTED"; // 5~10
}

/** 과거 이력(완료 이사 + 리뷰)을 가지는가? 1~2번(새 계정)만 제외 */
export function hasHistory(index: number): boolean {
  return positionInBatch(index) > 2;
}

/** 정지 대상 위치인가? (배치 내 9번) */
export function isSuspendedPosition(index: number): boolean {
  return positionInBatch(index) === 9;
}

/*
 * ── 기사별 리뷰 목표 수량(0~50) ──
 *   고객 "작성 리뷰"(고객당 3건)와는 독립적인 축이다.
 *   각 기사에게 0~50 사이 목표를 부여하고, 부족분은 아래 appendMoverReviewFill 에서
 *   전용 완료이사+리뷰로 채운다. 약 15%는 0(리뷰 없는 신규 기사)으로 둔다.
 */
const MOVER_REVIEW_MAX = 50;

function buildMoverReviewQuota(): Map<string, number> {
  const rng = makeRng(20260808);
  const quota = new Map<string, number>();

  for (let idx = 1; idx <= MOVER_COUNT; idx += 1) {
    const value = rng() < 0.15 ? 0 : randInt(rng, 1, MOVER_REVIEW_MAX);
    quota.set(moverEmail(idx), value);
  }

  return quota;
}

const MOVER_REVIEW_QUOTA = buildMoverReviewQuota();

/* ============================================================================
 *  메인 빌더
 * ========================================================================== */
function build(): {
  requests: ScenarioRequest[];
  estimates: ScenarioEstimate[];
  reviews: ScenarioReview[];
} {
  const requests: ScenarioRequest[] = [];
  const estimates: ScenarioEstimate[] = [];
  const reviews: ScenarioReview[] = [];

  for (let c = 1; c <= CUSTOMER_COUNT; c += 1) {
    const custEmail = customerEmail(c);
    const cid = String(c).padStart(3, "0");

    /*
     * 과거 이력(완료 이사 + 작성/미작성 리뷰)은 새 계정(배치 1~2번)만 제외하고 생성.
     */
    if (hasHistory(c)) {
      /* ── (1) 과거: 작성한 리뷰 3건 ── */
      for (let r = 0; r < REVIEWS_WRITTEN_PER_CUSTOMER; r += 1) {
        const key = `c${cid}-reviewed-${r + 1}`;
        const mover = scenarioMover(c * 7 + r);
        const moveType = MOVE_TYPES[(c + r) % MOVE_TYPES.length]!;

        requests.push({
          key,
          customerEmail: custEmail,
          moveType,
          moveDateOffsetDays: -(40 + c + r * 2),
          expiresInDays: -(40 + c + r * 2),
          fromRegion: FROM.region,
          fromZipCode: FROM.zip,
          fromAddress: FROM.address,
          fromDetailAddress: `과거-작성리뷰-${key}`,
          toRegion: TO.region,
          toZipCode: TO.zip,
          toAddress: TO.address,
          toDetailAddress: `도착-${key}`,
          status: "COMPLETED",
          isActive: false,
        });

        estimates.push({
          requestKey: key,
          moverEmail: mover,
          price: 150000 + ((c + r) % 20) * 10000,
          comment: `완료 이사 확정 견적 ${key}`,
          status: "CONFIRMED",
          isDesignated: false,
        });

        reviews.push({
          key,
          customerEmail: custEmail,
          moverEmail: mover,
          rating: 4 + ((c + r) % 2), // 4 or 5
          content: REVIEW_CONTENTS[(c + r) % REVIEW_CONTENTS.length]!,
        });
      }

      /* ── (2) 과거: 작성 가능한(미작성) 리뷰 3건 ── */
      for (let r = 0; r < REVIEWS_PENDING_PER_CUSTOMER; r += 1) {
        const key = `c${cid}-pending-${r + 1}`;
        const mover = scenarioMover(c * 5 + r + 3);
        const moveType = MOVE_TYPES[(c + r + 1) % MOVE_TYPES.length]!;

        requests.push({
          key,
          customerEmail: custEmail,
          moveType,
          moveDateOffsetDays: -(5 + ((c + r) % 12)),
          expiresInDays: -(5 + ((c + r) % 12)),
          fromRegion: FROM.region,
          fromZipCode: FROM.zip,
          fromAddress: FROM.address,
          fromDetailAddress: `과거-미작성리뷰-${key}`,
          toRegion: TO.region,
          toZipCode: TO.zip,
          toAddress: TO.address,
          toDetailAddress: `도착-${key}`,
          status: "COMPLETED",
          isActive: false,
        });

        estimates.push({
          requestKey: key,
          moverEmail: mover,
          price: 150000 + ((c + r) % 25) * 10000,
          comment: `완료 이사 확정 견적(리뷰대기) ${key}`,
          status: "CONFIRMED",
          isDesignated: false,
        });

        reviews.push({
          key,
          customerEmail: custEmail,
          moverEmail: mover,
          rating: null, // 미작성
          content: null,
        });
      }
    } // end if(hasHistory)

    /* ── (3) 현재 진행 상태 (위치 기반: NONE/REQUESTED/QUOTED) ── */
    const phase = phaseForCustomer(c);

    if (phase === "REQUESTED") {
      // OPEN 요청만, 견적 없음
      const key = `c${cid}-current-requested`;
      requests.push({
        key,
        customerEmail: custEmail,
        moveType: MOVE_TYPES[c % MOVE_TYPES.length]!,
        moveDateOffsetDays: 15 + (c % 14),
        expiresInDays: 7 + (c % 7),
        fromRegion: FROM.region,
        fromZipCode: FROM.zip,
        fromAddress: FROM.address,
        fromDetailAddress: `현재-요청대기-${key}`,
        toRegion: TO.region,
        toZipCode: TO.zip,
        toAddress: TO.address,
        toDetailAddress: `도착-${key}`,
        status: "OPEN",
        isActive: true,
      });
    } else if (phase === "QUOTED") {
      // OPEN 요청 + SENT 견적 2~3개
      const key = `c${cid}-current-quoted`;
      requests.push({
        key,
        customerEmail: custEmail,
        moveType: MOVE_TYPES[c % MOVE_TYPES.length]!,
        moveDateOffsetDays: 20 + (c % 14),
        expiresInDays: 10 + (c % 7),
        fromRegion: FROM.region,
        fromZipCode: FROM.zip,
        fromAddress: FROM.address,
        fromDetailAddress: `현재-견적도착-${key}`,
        toRegion: TO.region,
        toZipCode: TO.zip,
        toAddress: TO.address,
        toDetailAddress: `도착-${key}`,
        status: "OPEN",
        isActive: true,
      });

      const quoteCount = 2 + (c % 2); // 2 or 3
      const usedMovers = new Set<string>();
      for (let j = 0; j < quoteCount; j += 1) {
        let mover = scenarioMover(c * 11 + j * 3);
        // 같은 요청 내 기사 중복 방지 (Estimate unique(reqId, moverId))
        let guard = 0;
        while (usedMovers.has(mover) && guard < MOVER_COUNT) {
          mover = scenarioMover(c * 11 + j * 3 + guard + 1);
          guard += 1;
        }
        usedMovers.add(mover);

        estimates.push({
          requestKey: key,
          moverEmail: mover,
          price: 150000 + ((c + j) % 20) * 10000,
          // 지정 견적(첫 견적)은 채팅 진입 테스트용 코멘트로 표시
          comment:
            j === 0
              ? CHAT_SENT_ESTIMATE_COMMENTS[c % CHAT_SENT_ESTIMATE_COMMENTS.length]!
              : QUOTE_COMMENTS[(c + j) % QUOTE_COMMENTS.length]!,
          status: "SENT",
          isDesignated: j === 0, // 첫 견적만 지정
        });
      }
    }
    // phase === "NONE" → 현재 진행 요청 없음 (아무것도 추가하지 않음)
  }

  return { requests, estimates, reviews };
}

/* ============================================================================
 *  기사 리뷰 분포 채우기 (기사당 0~50개, 고객 작성 리뷰와 독립 축)
 * ----------------------------------------------------------------------------
 *  각 기사의 목표 quota(0~50)에서, 이미 고객 "작성 리뷰"로 붙은 수를 뺀 만큼
 *  전용 완료이사 + 리뷰를 추가 생성한다. 작성 고객은 100명을 순환 배정한다.
 *  → 기사 리뷰 수는 정확히 quota(0~50)가 되고, 고객의 "작성 리뷰"는 3건 + α 가 된다.
 *  (Review 는 estimateId unique. 요청/견적을 매건 새로 만들어 충돌 없음)
 * ========================================================================== */
function appendMoverReviewFill(
  requests: ScenarioRequest[],
  estimates: ScenarioEstimate[],
  reviews: ScenarioReview[],
): void {
  const already = new Map<string, number>();
  for (const rv of reviews) {
    if (rv.rating !== null) {
      already.set(rv.moverEmail, (already.get(rv.moverEmail) ?? 0) + 1);
    }
  }

  const rng = makeRng(99887766);
  let fillSeq = 0;

  /*
   * 기사 리뷰를 작성할 고객 풀 = 과거 이력을 가지는 고객(위치 3~10)만.
   * 새 계정(위치 1~2)은 "아무것도 없는 상태"여야 하므로 제외한다.
   */
  const historyCustomerEmails: string[] = [];
  for (let c = 1; c <= CUSTOMER_COUNT; c += 1) {
    if (hasHistory(c)) {
      historyCustomerEmails.push(customerEmail(c));
    }
  }

  for (let idx = 1; idx <= MOVER_COUNT; idx += 1) {
    const mEmail = moverEmail(idx);
    const target = MOVER_REVIEW_QUOTA.get(mEmail) ?? 0;
    const have = already.get(mEmail) ?? 0;
    const need = Math.max(0, target - have);

    for (let k = 0; k < need; k += 1) {
      fillSeq += 1;
      const custEmail = historyCustomerEmails[(fillSeq - 1) % historyCustomerEmails.length]!;
      const key = `mfill-m${String(idx).padStart(3, "0")}-${String(k + 1).padStart(2, "0")}`;
      const moveType = MOVE_TYPES[fillSeq % MOVE_TYPES.length]!;

      requests.push({
        key,
        customerEmail: custEmail,
        moveType,
        moveDateOffsetDays: -(60 + (fillSeq % 240)),
        expiresInDays: -(60 + (fillSeq % 240)),
        fromRegion: FROM.region,
        fromZipCode: FROM.zip,
        fromAddress: FROM.address,
        fromDetailAddress: `기사리뷰-완료이사-${key}`,
        toRegion: TO.region,
        toZipCode: TO.zip,
        toAddress: TO.address,
        toDetailAddress: `도착-${key}`,
        status: "COMPLETED",
        isActive: false,
      });

      estimates.push({
        requestKey: key,
        moverEmail: mEmail,
        price: 150000 + (fillSeq % 30) * 10000,
        comment: `기사 리뷰 분포용 확정 견적 ${key}`,
        status: "CONFIRMED",
        isDesignated: false,
      });

      reviews.push({
        key,
        customerEmail: custEmail,
        moverEmail: mEmail,
        rating: 3 + Math.floor(rng() * 3), // 3~5
        content: REVIEW_CONTENTS[fillSeq % REVIEW_CONTENTS.length]!,
      });
    }
  }
}

const built = ((): {
  requests: ScenarioRequest[];
  estimates: ScenarioEstimate[];
  reviews: ScenarioReview[];
} => {
  const base = build();
  appendMoverReviewFill(base.requests, base.estimates, base.reviews);
  return base;
})();

export const SCENARIO_REQUESTS: readonly ScenarioRequest[] = built.requests;
export const SCENARIO_ESTIMATES: readonly ScenarioEstimate[] = built.estimates;
export const SCENARIO_REVIEWS: readonly ScenarioReview[] = built.reviews;

/** seedReviews 가 쓰는 형태: key → 리뷰 메타 */
export const SCENARIO_REVIEW_ITEMS = SCENARIO_REVIEWS;
