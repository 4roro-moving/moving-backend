/*
 * 커뮤니티 기능: 찜 / 거주후기 / 나눔
 * ============================================================================
 *
 *  전부 기존 시드에 아예 없던 영역이다.
 *
 *  · FavoriteMover  : 없으면 MOVER_LIST_SELECT 의 _count.favoritesReceived 가
 *                     항상 0 이라 해당 상관 서브쿼리의 실제 부하를 측정할 수 없다.
 *  · ResidenceReview: RegionReviewStatistic 캐시와 반드시 일치해야 한다.
 *                     (isHidden=false 인 것만 집계 — 서비스 로직과 동일)
 *  · Giveaway       : status 와 receiverId, GiveawayRequest.status 가
 *                     서로 모순되지 않아야 한다.
 * ============================================================================
 */

import { REGION_WEIGHTS, type SeedConfig } from "../config.js";
import {
  paretoCount,
  pickRating,
  pickSeasonalPastDate,
  weightedPick,
} from "../lib/distributions.js";
import { chance, deriveRng, randInt, sampleIndices, type Rng } from "../lib/rng.js";
import { makeGiveaway, makeGiveawayRequestMessage, makeResidenceReview } from "../lib/text.js";
import type { RegionRow } from "./regions.js";
import type { SeedCustomer, SeedMover } from "./users.js";

export interface CommunityResult {
  rows: {
    favoriteMovers: unknown[];
    residenceReviews: unknown[];
    regionReviewStatistics: unknown[];
    giveaways: unknown[];
    giveawayImages: unknown[];
    giveawayRequests: unknown[];
  };
}

/** 나눔 이미지도 프로필과 같은 규약으로 S3 키를 저장한다 (완성 URL 금지) */
function giveawayImageKey(giveawayId: number, order: number): string {
  return `giveaways/${giveawayId}/seed-${order}.webp`;
}

function generateFavorites(
  rng: Rng,
  customers: SeedCustomer[],
  movers: SeedMover[],
  now: Date,
): unknown[] {
  const rows: unknown[] = [];
  const activeMovers = movers.filter((m) => m.isActive);

  if (activeMovers.length === 0) {
    return rows;
  }

  let id = 1;

  for (const customer of customers) {
    /*
     * 대부분의 고객은 찜을 0~2개만 한다. 소수가 많이 찜한다.
     * 인기 기사에 찜이 몰리도록 앞쪽(=리뷰 많은 쪽) 가중을 살짝 준다.
     */
    const count = paretoCount(rng, { min: 1, max: 25, alpha: 1.7, zeroRatio: 0.45 });

    if (count === 0) {
      continue;
    }

    const picked = sampleIndices(rng, activeMovers.length, count);

    for (const index of picked) {
      const mover = activeMovers[index]!;

      /*
       * 찜은 고객과 기사 "둘 다" 가입한 이후에만 가능하다.
       * 고객 가입일만 보면 아직 없는 기사를 찜하는 데이터가 생긴다.
       */
      const windowStart = Math.max(customer.createdAt.getTime(), mover.createdAt.getTime());

      if (windowStart >= now.getTime()) {
        continue;
      }

      const createdAt = new Date(windowStart + rng() * (now.getTime() - windowStart));

      rows.push({
        id,
        customerId: customer.id,
        moverId: mover.id,
        createdAt,
      });
      id += 1;
    }
  }

  return rows;
}

function generateResidenceReviews(
  rng: Rng,
  config: SeedConfig,
  regions: RegionRow[],
  customers: SeedCustomer[],
  now: Date,
): { reviews: unknown[]; statistics: unknown[] } {
  const reviews: unknown[] = [];
  const regionByName = new Map(regions.map((r) => [r.name, r.id]));
  const regionNameById = new Map(regions.map((r) => [r.id, r.name]));

  /** 지역별 (합계, 개수) — isHidden=false 만 집계한다 */
  const agg = new Map<number, { sum: number; count: number }>();

  let id = 1;

  for (let i = 0; i < config.residenceReviews; i += 1) {
    const author = customers[randInt(rng, 0, customers.length - 1)]!;
    const regionId = regionByName.get(weightedPick<string>(rng, REGION_WEIGHTS)) ?? 1;
    const regionName = regionNameById.get(regionId) ?? "서울";

    const rating = pickRating(rng);
    const { title, content } = makeResidenceReview(rng, regionName, rating);

    // 관리자 숨김 처리된 후기는 소수
    const isHidden = chance(rng, 0.02);

    let createdAt = pickSeasonalPastDate(rng, now);

    if (createdAt.getTime() < author.createdAt.getTime()) {
      createdAt = new Date(author.createdAt.getTime() + randInt(rng, 1, 30) * 86_400_000);
    }

    if (createdAt.getTime() > now.getTime()) {
      createdAt = now;
    }

    reviews.push({
      id,
      authorId: author.id,
      regionId,
      title,
      content,
      rating,
      isHidden,
      createdAt,
      updatedAt: createdAt,
    });
    id += 1;

    /*
     * 통계는 노출 중인 후기만 포함한다.
     * residence-review.repository 의 집계 조건과 정확히 같아야 한다.
     */
    if (!isHidden) {
      const current = agg.get(regionId) ?? { sum: 0, count: 0 };
      current.sum += rating;
      current.count += 1;
      agg.set(regionId, current);
    }
  }

  /*
   * 통계 행은 전 지역에 대해 만든다.
   * 후기가 하나도 없는 지역도 0 으로 존재해야 upsert 가 아닌 조회 경로에서
   * null 처리 분기를 타지 않는다.
   */
  const statistics = regions.map((region, index) => {
    const current = agg.get(region.id) ?? { sum: 0, count: 0 };
    const average = current.count === 0 ? 0 : current.sum / current.count;

    return {
      id: index + 1,
      regionId: region.id,
      ratingSum: current.sum,
      reviewCount: current.count,
      // Decimal(3,2) — 소수 둘째 자리까지
      averageRating: Math.round(average * 100) / 100,
      createdAt: now,
      updatedAt: now,
    };
  });

  return { reviews, statistics };
}

function generateGiveaways(
  rng: Rng,
  config: SeedConfig,
  regions: RegionRow[],
  customers: SeedCustomer[],
  now: Date,
): { giveaways: unknown[]; images: unknown[]; requests: unknown[] } {
  const giveaways: unknown[] = [];
  const images: unknown[] = [];
  const requests: unknown[] = [];

  const regionByName = new Map(regions.map((r) => [r.name, r.id]));
  const regionNameById = new Map(regions.map((r) => [r.id, r.name]));

  let id = 1;
  let imageId = 1;
  let requestId = 1;

  for (let i = 0; i < config.giveaways; i += 1) {
    const author = customers[randInt(rng, 0, customers.length - 1)]!;
    const regionId = regionByName.get(weightedPick<string>(rng, REGION_WEIGHTS)) ?? 1;
    const regionName = regionNameById.get(regionId) ?? "서울";

    const { title, description } = makeGiveaway(rng, regionName);

    let createdAt = pickSeasonalPastDate(rng, now);

    if (createdAt.getTime() < author.createdAt.getTime()) {
      createdAt = new Date(author.createdAt.getTime() + randInt(rng, 1, 60) * 86_400_000);
    }

    if (createdAt.getTime() > now.getTime()) {
      createdAt = now;
    }

    /*
     * 상태 분포: 완료된 글이 가장 많고, 진행 중이 가장 적다.
     * status 와 receiverId 는 반드시 일관되어야 한다.
     *   AVAILABLE   → receiverId = null
     *   IN_PROGRESS → receiverId = 선정된 신청자
     *   COMPLETED   → receiverId = 선정된 신청자
     */
    const status = weightedPick<"AVAILABLE" | "IN_PROGRESS" | "COMPLETED">(rng, {
      AVAILABLE: 30,
      IN_PROGRESS: 12,
      COMPLETED: 58,
    });

    const currentId = id;
    id += 1;

    /* ── 신청자 ─────────────────────────────────────────────────── */

    const requesterCount = paretoCount(rng, { min: 1, max: 12, alpha: 1.6, zeroRatio: 0.2 });
    const candidateIndices = sampleIndices(rng, customers.length, requesterCount + 2);

    // 작성자 본인은 신청할 수 없다 (서비스 정책)
    const requesters = candidateIndices
      .map((index) => customers[index]!)
      .filter((c) => c.id !== author.id)
      .slice(0, requesterCount);

    const needsReceiver = status !== "AVAILABLE";
    const selectedIndex = needsReceiver && requesters.length > 0 ? 0 : -1;
    const receiverId = selectedIndex >= 0 ? requesters[selectedIndex]!.id : null;

    // 수령자가 필요한데 신청자가 없으면 AVAILABLE 로 강등
    const finalStatus = needsReceiver && receiverId === null ? "AVAILABLE" : status;

    const updatedAt =
      finalStatus === "COMPLETED"
        ? new Date(createdAt.getTime() + randInt(rng, 1, 20) * 86_400_000)
        : createdAt;

    giveaways.push({
      id: currentId,
      authorId: author.id,
      receiverId: finalStatus === "AVAILABLE" ? null : receiverId,
      regionId,
      title,
      description,
      status: finalStatus,
      isHidden: chance(rng, 0.015),
      createdAt,
      updatedAt: updatedAt > now ? now : updatedAt,
    });

    // 이미지 0~3장. sortOrder 는 글 안에서 unique 여야 한다.
    const imageCount = randInt(rng, 0, 3);

    for (let order = 0; order < imageCount; order += 1) {
      images.push({
        id: imageId,
        giveawayId: currentId,
        imageKey: giveawayImageKey(currentId, order),
        sortOrder: order,
        createdAt,
        updatedAt: createdAt,
      });
      imageId += 1;
    }

    for (let ri = 0; ri < requesters.length; ri += 1) {
      const requester = requesters[ri]!;

      /*
       * 신청 상태
       *  - 선정된 사람        → SELECTED
       *  - 완료 글의 나머지    → REJECTED (다른 사람이 선정됨)
       *  - 진행 중 글의 나머지 → PENDING 또는 CANCELLED
       *  - 신청 가능 글       → PENDING 위주
       */
      const requestStatus =
        ri === selectedIndex
          ? "SELECTED"
          : finalStatus === "COMPLETED"
            ? "REJECTED"
            : chance(rng, 0.15)
              ? "CANCELLED"
              : "PENDING";

      /*
       * 신청 시각은 글 작성 이후 && 신청자 가입 이후 && 현재 이전.
       * 세 조건을 모두 만족하지 못하면 이 신청은 만들지 않는다.
       */
      const reqWindowStart = Math.max(
        createdAt.getTime() + 3_600_000,
        requester.createdAt.getTime(),
      );

      if (reqWindowStart >= now.getTime()) {
        continue;
      }

      /*
       * 창 안에서 균등하게 뽑는다.
       * min(now, start + 240h) 로 자르기만 하면 최근 글일수록 신청 시각이
       * 전부 정확히 now 로 몰려서, 재신청 이력을 만들 여유가 사라진다.
       */
      const reqWindowEnd = Math.min(now.getTime(), reqWindowStart + 240 * 3_600_000);
      const requestCreatedAt = new Date(
        reqWindowStart + rng() * Math.max(0, reqWindowEnd - reqWindowStart),
      );

      requests.push({
        id: requestId,
        giveawayId: currentId,
        requesterId: requester.id,
        status: requestStatus,
        message: makeGiveawayRequestMessage(rng),
        createdAt: requestCreatedAt,
        updatedAt: requestCreatedAt,
      });
      requestId += 1;

      /*
       * ── 재신청 이력 ───────────────────────────────────────────────
       *
       * 20260819060000_allow_giveaway_request_reapply 로 (글, 신청자) 전체
       * unique 가 제거되고, PENDING·SELECTED 인 활성 신청만 1건으로 제한된다.
       * 즉 "취소했다가 다시 신청" 이 가능해졌다.
       *
       * 앞선 신청이 CANCELLED 로 끝난 경우에만 새 row 를 하나 더 만든다.
       * (REJECTED 뒤 재신청도 제약상 가능하지만, 이미 다른 사람이 선정된
       *  글에 다시 신청하는 건 실제로는 드물어 재현하지 않는다)
       */
      if (requestStatus === "CANCELLED" && finalStatus === "AVAILABLE" && chance(rng, 0.45)) {
        const reapplyWindowEnd = Math.min(
          now.getTime(),
          requestCreatedAt.getTime() + 96 * 3_600_000,
        );

        const reapplyAt = new Date(
          requestCreatedAt.getTime() +
            rng() * Math.max(0, reapplyWindowEnd - requestCreatedAt.getTime()),
        );

        if (reapplyAt.getTime() > requestCreatedAt.getTime()) {
          requests.push({
            id: requestId,
            giveawayId: currentId,
            requesterId: requester.id,
            status: "PENDING",
            message: "취소했다가 다시 신청드립니다. 아직 가능할까요?",
            createdAt: reapplyAt,
            updatedAt: reapplyAt,
          });
          requestId += 1;
        }
      }
    }
  }

  return { giveaways, images, requests };
}

export function generateCommunity(
  config: SeedConfig,
  regions: RegionRow[],
  customers: SeedCustomer[],
  movers: SeedMover[],
  now: Date,
): CommunityResult {
  const rng = deriveRng(20260820, "community");

  const favoriteMovers = generateFavorites(rng, customers, movers, now);
  const residence = generateResidenceReviews(rng, config, regions, customers, now);
  const giveaway = generateGiveaways(rng, config, regions, customers, now);

  return {
    rows: {
      favoriteMovers,
      residenceReviews: residence.reviews,
      regionReviewStatistics: residence.statistics,
      giveaways: giveaway.giveaways,
      giveawayImages: giveaway.images,
      giveawayRequests: giveaway.requests,
    },
  };
}
