/**
 * 리뷰 시드용 메타 데이터
 *
 * Review는 estimateId에 1:1로 묶이므로
 * COMPLETED 요청 + CONFIRMED 견적 쌍을 함께 정의합니다.
 *
 * 기사별 리뷰 개수와 평점 분포를 다르게 구성해
 * 리뷰 많은순 / 평점 높은순 정렬 결과를 확인할 수 있도록 합니다.
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

export const REVIEW_STAT_MOVER_EMAILS = [
  "mover1@test.com",
  "mover2@test.com",
  "mover3@test.com",
  "mover4@test.com",
  "mover5@test.com",
  "mover6@test.com",
  "mover7@test.com",
  "mover8@test.com",
] as const;

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
  moveType: ReviewSeedMoveType;
  basePrice: number;
  ratings: readonly number[];
}

function repeatRating(rating: number, count: number) {
  return Array.from({ length: count }, () => rating);
}

const REVIEW_SEED_GROUPS: readonly ReviewSeedGroup[] = [
  {
    moverEmail: "mover5@test.com",
    moveType: "HOME",
    basePrice: 320000,
    ratings: [...repeatRating(5, 19), ...repeatRating(4, 5)], // 24개, 평균 약 4.8
  },
  {
    moverEmail: "mover3@test.com",
    moveType: "OFFICE",
    basePrice: 360000,
    ratings: [...repeatRating(5, 14), ...repeatRating(4, 2)], // 16개, 평균 약 4.9
  },
  {
    moverEmail: "mover8@test.com",
    moveType: "HOME",
    basePrice: 300000,
    ratings: [...repeatRating(5, 12)], // 12개, 평균 5.0
  },
  {
    moverEmail: "mover6@test.com",
    moveType: "HOME",
    basePrice: 280000,
    ratings: [...repeatRating(5, 7), ...repeatRating(4, 3)], // 10개, 평균 4.7
  },
  {
    moverEmail: "mover2@test.com",
    moveType: "HOME",
    basePrice: 260000,
    ratings: [...repeatRating(5, 5), ...repeatRating(4, 3)], // 8개, 평균 약 4.6
  },
  {
    moverEmail: "mover4@test.com",
    moveType: "SMALL",
    basePrice: 180000,
    ratings: [...repeatRating(5, 3), ...repeatRating(4, 3)], // 6개, 평균 4.5
  },
  {
    moverEmail: "mover7@test.com",
    moveType: "SMALL",
    basePrice: 150000,
    ratings: [...repeatRating(5, 2), ...repeatRating(4, 2)], // 4개, 평균 4.5
  },
] as const;

function buildReviewSeedItems(): ReviewSeedItem[] {
  const items: ReviewSeedItem[] = [];

  for (const group of REVIEW_SEED_GROUPS) {
    const moverNo = group.moverEmail.match(/^mover(\d+)@/)?.[1] ?? "0";

    for (let index = 0; index < group.ratings.length; index += 1) {
      const sequence = String(index + 1).padStart(2, "0");
      const customerEmail = CUSTOMER_EMAILS[index % CUSTOMER_EMAILS.length]!;

      items.push({
        key: `completed-mover${moverNo}-${sequence}`,
        customerEmail,
        moverEmail: group.moverEmail,
        moveType: group.moveType,
        // 과거 이사 완료 건
        moveDateOffsetDays: -(index + 1) * 3,
        rating: group.ratings[index]!,
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
