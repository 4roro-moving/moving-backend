/**
 * 리뷰 시드용 메타 데이터
 *
 * Review는 estimateId에 1:1로 묶이므로
 * COMPLETED 요청 + CONFIRMED 견적 쌍을 함께 정의합니다.
 *
 * 페이지네이션 확인용으로 mover5에 12개(페이지당 5개 기준 3페이지),
 * mover1·mover2에도 각각 6개씩 넣습니다.
 */

export type ReviewSeedMoveType = "SMALL" | "HOME" | "OFFICE";

export interface ReviewSeedItem {
  key: string;
  customerEmail: string;
  moverEmail: string;
  moveType: ReviewSeedMoveType;
  moveDateOffsetDays: number;
  rating: number;
  content: string;
  price: number;
  comment: string;
}

const REVIEW_CONTENTS = [
  "듣던대로 정말 친절하시고 물건도 잘 옮겨주셨어요!\n나중에 또 짐 옮길 일 생기면 부탁드릴 예정입니다!!",
  "비 오는데도 꼼꼼히 잘 해주셔서 감사드립니다 :)",
  "시간 약속을 잘 지켜주셔서 좋았어요.",
  "포장이 꼼꼼해서 파손 없이 이사 완료했습니다.",
  "응대가 빠르고 설명이 친절했어요.",
  "짐이 많았는데도 체계적으로 잘 진행해 주셨습니다.",
] as const;

const CUSTOMER_EMAILS = [
  "customer1@test.com",
  "customer2@test.com",
  "customer3@test.com",
  "customer4@test.com",
  "customer5@test.com",
  "customer6@test.com",
  "customer7@test.com",
  "customer8@test.com",
] as const;

interface ReviewSeedGroup {
  moverEmail: string;
  count: number;
  moveType: ReviewSeedMoveType;
  basePrice: number;
}

const REVIEW_SEED_GROUPS: readonly ReviewSeedGroup[] = [
  { moverEmail: "mover5@test.com", count: 12, moveType: "HOME", basePrice: 320000 },
  { moverEmail: "mover1@test.com", count: 6, moveType: "SMALL", basePrice: 120000 },
  { moverEmail: "mover2@test.com", count: 6, moveType: "HOME", basePrice: 280000 },
] as const;

function buildReviewSeedItems(): ReviewSeedItem[] {
  const items: ReviewSeedItem[] = [];

  for (const group of REVIEW_SEED_GROUPS) {
    const moverNo = group.moverEmail.match(/^mover(\d+)@/)?.[1] ?? "0";

    for (let index = 0; index < group.count; index += 1) {
      const sequence = String(index + 1).padStart(2, "0");
      const customerEmail = CUSTOMER_EMAILS[index % CUSTOMER_EMAILS.length]!;

      items.push({
        key: `completed-mover${moverNo}-${sequence}`,
        customerEmail,
        moverEmail: group.moverEmail,
        moveType: group.moveType,
        // 과거 이사 완료 건
        moveDateOffsetDays: -(index + 1) * 3,
        rating: 5 - (index % 3 === 0 ? 1 : 0),
        content: REVIEW_CONTENTS[index % REVIEW_CONTENTS.length]!,
        price: group.basePrice + index * 5000,
        comment: `${group.moverEmail} 시드 확정 견적 (${sequence})`,
      });
    }
  }

  return items;
}

export const REVIEW_SEED_ITEMS: readonly ReviewSeedItem[] = buildReviewSeedItems();

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
