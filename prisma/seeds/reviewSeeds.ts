/**
 * 리뷰/완료이사 시드용 메타 데이터
 *
 * 구조
 * 1) STAT 그룹: 기존 mover1~8 정렬(리뷰많은순/평점높은순) 확인용 — 원본 유지.
 *    → 모두 리뷰가 "작성된" COMPLETED 건.
 * 2) 전체 커버리지 그룹: customer1~100 각자에게 completed 이사를 채웁니다.
 *    → 절반은 리뷰 "작성됨", 절반은 리뷰 "미작성"(고객이 직접 쓸 수 있는 상태).
 *
 * 리뷰 작성 가능 조건(도메인):
 *   EstimateRequest.status = COMPLETED
 *   + Estimate.status = CONFIRMED
 *   + 아직 Review row 없음
 * 미작성 건은 위 2개까지만 만들고 Review 를 만들지 않습니다.
 */

import { customerEmail, CUSTOMER_COUNT } from "./customers.js";
import { moverEmail, MOVER_COUNT } from "./movers.js";

export type ReviewSeedMoveType = "SMALL" | "HOME" | "OFFICE";

export interface ReviewSeedItem {
  key: string;
  customerEmail: string;
  moverEmail: string;
  moveType: ReviewSeedMoveType;
  moveDateOffsetDays: number;
  price: number;
  comment: string;
  /** 리뷰가 작성된 건이면 rating/content 를 채웁니다. 미작성이면 null. */
  rating: number | null;
  content: string | null;
}

const REVIEW_CONTENTS = [
  "듣던대로 정말 친절하시고 물건도 잘 옮겨주셨어요!\n나중에 또 짐 옮길 일 생기면 부탁드릴 예정입니다!!",
  "비 오는데도 꼼꼼히 잘 해주셔서 감사드립니다 :)",
  "시간 약속을 잘 지켜주셔서 좋았어요.",
  "포장이 꼼꼼해서 파손 없이 이사 완료했습니다.",
  "응대가 빠르고 설명이 친절했어요.",
  "짐이 많았는데도 체계적으로 잘 진행해 주셨습니다.",
  "견적 안내가 명확했고 추가 비용 없이 진행되어 만족했습니다.",
  "가구 배치까지 꼼꼼히 도와주셔서 편했습니다.",
] as const;

const MOVE_TYPES: readonly ReviewSeedMoveType[] = ["SMALL", "HOME", "OFFICE"];

/* =========================================================================
 * 1) STAT 그룹 (mover1~8 정렬 확인용) — 원본 유지, 전부 리뷰 작성됨
 * ========================================================================= */

/*
 * STAT 그룹에서 리뷰 작성자로 순환 사용할 고객들.
 * (통계 재계산 대상 기사님은 seedReviews 에서 "리뷰가 실제 달린 moverId"로
 *  동적으로 판단하므로 별도 상수 목록을 두지 않습니다.)
 */
const STAT_CUSTOMER_EMAILS = Array.from({ length: 8 }, (_, i) => customerEmail(i + 1));

interface ReviewSeedGroup {
  moverEmail: string;
  moveType: ReviewSeedMoveType;
  basePrice: number;
  ratings: readonly number[];
}

function repeatRating(rating: number, count: number) {
  return Array.from({ length: count }, () => rating);
}

const REVIEW_SEED_GROUPS: readonly ReviewSeedGroup[] = [
  {
    moverEmail: moverEmail(5),
    moveType: "HOME",
    basePrice: 320000,
    ratings: [...repeatRating(5, 19), ...repeatRating(4, 5)], // 24개, 평균 약 4.8
  },
  {
    moverEmail: moverEmail(3),
    moveType: "OFFICE",
    basePrice: 360000,
    ratings: [...repeatRating(5, 14), ...repeatRating(4, 2)], // 16개, 평균 약 4.9
  },
  {
    moverEmail: moverEmail(8),
    moveType: "HOME",
    basePrice: 300000,
    ratings: [...repeatRating(5, 12)], // 12개, 평균 5.0
  },
  {
    moverEmail: moverEmail(6),
    moveType: "HOME",
    basePrice: 280000,
    ratings: [...repeatRating(5, 7), ...repeatRating(4, 3)], // 10개, 평균 4.7
  },
  {
    moverEmail: moverEmail(2),
    moveType: "HOME",
    basePrice: 260000,
    ratings: [...repeatRating(5, 5), ...repeatRating(4, 3)], // 8개, 평균 약 4.6
  },
  {
    moverEmail: moverEmail(4),
    moveType: "SMALL",
    basePrice: 180000,
    ratings: [...repeatRating(5, 3), ...repeatRating(4, 3)], // 6개, 평균 4.5
  },
  {
    moverEmail: moverEmail(7),
    moveType: "SMALL",
    basePrice: 150000,
    ratings: [...repeatRating(5, 2), ...repeatRating(4, 2)], // 4개, 평균 4.5
  },
] as const;

function buildStatItems(): ReviewSeedItem[] {
  const items: ReviewSeedItem[] = [];

  for (const group of REVIEW_SEED_GROUPS) {
    const moverNo = group.moverEmail.match(/^mover(\d+)@/)?.[1] ?? "0";

    for (let index = 0; index < group.ratings.length; index += 1) {
      const sequence = String(index + 1).padStart(2, "0");
      const customer = STAT_CUSTOMER_EMAILS[index % STAT_CUSTOMER_EMAILS.length]!;

      items.push({
        key: `stat-mover${moverNo}-${sequence}`,
        customerEmail: customer,
        moverEmail: group.moverEmail,
        moveType: group.moveType,
        moveDateOffsetDays: -(index + 1) * 3, // 과거 이사 완료 건
        price: group.basePrice + index * 5000,
        comment: `${group.moverEmail} 시드 확정 견적 (${sequence})`,
        rating: group.ratings[index]!,
        content: REVIEW_CONTENTS[index % REVIEW_CONTENTS.length]!,
      });
    }
  }

  return items;
}

/* =========================================================================
 * 2) 전체 커버리지 그룹
 *    customer1~100 각각에게 completed 이사 2건씩:
 *      - 1건: 리뷰 작성됨
 *      - 1건: 리뷰 미작성 (고객이 언제든 작성 가능)
 *    기사님은 승인된(APPROVED) 기사에게만 배정합니다.
 *    (mover7=REJECTED, mover8=PENDING 은 확정 견적 배정에서 제외)
 * ========================================================================= */

// 승인된 기사 index 목록: 1~6 + 9~100 (7,8 제외)
const APPROVED_MOVER_INDEXES: number[] = [];
for (let i = 1; i <= MOVER_COUNT; i += 1) {
  if (i === 7 || i === 8) {
    continue;
  }
  APPROVED_MOVER_INDEXES.push(i);
}

function pickApprovedMoverEmail(offset: number): string {
  const moverIndex = APPROVED_MOVER_INDEXES[offset % APPROVED_MOVER_INDEXES.length]!;

  return moverEmail(moverIndex);
}

function buildCoverageItems(): ReviewSeedItem[] {
  const items: ReviewSeedItem[] = [];

  for (let c = 1; c <= CUSTOMER_COUNT; c += 1) {
    const custEmail = customerEmail(c);
    const moveType = MOVE_TYPES[c % MOVE_TYPES.length]!;

    // (a) 리뷰 작성된 completed 건
    items.push({
      key: `cov-c${String(c).padStart(3, "0")}-reviewed`,
      customerEmail: custEmail,
      moverEmail: pickApprovedMoverEmail(c),
      moveType,
      moveDateOffsetDays: -(30 + c), // 충분히 과거
      price: 150000 + (c % 20) * 10000,
      comment: `커버리지 시드 확정 견적 c${c}-reviewed`,
      rating: 4 + (c % 2), // 4 또는 5
      content: REVIEW_CONTENTS[c % REVIEW_CONTENTS.length]!,
    });

    // (b) 리뷰 미작성 completed 건 (다른 기사에게 배정해 확정 견적 unique 보장)
    items.push({
      key: `cov-c${String(c).padStart(3, "0")}-pending`,
      customerEmail: custEmail,
      moverEmail: pickApprovedMoverEmail(c + 1),
      moveType,
      moveDateOffsetDays: -(3 + (c % 10)), // 최근 완료 → 리뷰 유도
      price: 150000 + (c % 25) * 10000,
      comment: `커버리지 시드 확정 견적 c${c}-pending(리뷰대기)`,
      rating: null,
      content: null,
    });
  }

  return items;
}

export const REVIEW_SEED_ITEMS: readonly ReviewSeedItem[] = [
  ...buildStatItems(),
  ...buildCoverageItems(),
];

/** COMPLETED 요청 시드로 변환 */
export function toReviewEstimateRequests(items: readonly ReviewSeedItem[] = REVIEW_SEED_ITEMS) {
  return items.map((item) => ({
    key: item.key,
    customerEmail: item.customerEmail,
    moveType: item.moveType,
    moveDateOffsetDays: item.moveDateOffsetDays,
    // COMPLETED(과거 이사) 요청은 만료일도 과거로 맞춤
    expiresInDays: item.moveDateOffsetDays,

    fromRegion: "서울",
    fromZipCode: "06236",
    fromAddress: "서울특별시 강남구 테헤란로 123",
    fromDetailAddress: `시드-리뷰-${item.key}`,

    toRegion: "경기",
    toZipCode: "13529",
    toAddress: "경기도 성남시 분당구 판교역로 166",
    toDetailAddress: `도착-${item.key}`,

    status: "COMPLETED" as const,
    isActive: false,
  }));
}

/** CONFIRMED 견적 시드로 변환 */
export function toReviewEstimates(items: readonly ReviewSeedItem[] = REVIEW_SEED_ITEMS) {
  return items.map((item) => ({
    requestKey: item.key,
    moverEmail: item.moverEmail,
    price: item.price,
    comment: item.comment,
    status: "CONFIRMED" as const,
    isDesignated: false,
  }));
}
