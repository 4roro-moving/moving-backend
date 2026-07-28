import { Prisma, type PrismaClient } from "@prisma/client";

import type { EstimateRequestSeedKey } from "./estimateRequests.js";
import { REVIEW_SEED_ITEMS } from "./reviewSeeds.js";

export interface ConfirmedEstimateSeedRef {
  requestKey: EstimateRequestSeedKey;
  estimateId: number;
  customerId: string;
  moverId: string;
}

/** COMPLETED 요청에 달린 확정 견적에 Review를 upsert하고 프로필 통계를 맞춥니다. */
export async function seedReviews(
  prisma: PrismaClient,
  confirmedEstimates: readonly ConfirmedEstimateSeedRef[],
): Promise<void> {
  console.log("⭐ 리뷰 데이터를 생성합니다.");

  const reviewByRequestKey = new Map(REVIEW_SEED_ITEMS.map((item) => [item.key, item] as const));

  const targets = confirmedEstimates.filter((estimate) =>
    reviewByRequestKey.has(estimate.requestKey),
  );

  if (targets.length === 0) {
    console.log("  ⚠️ 리뷰를 연결할 확정 견적이 없습니다.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const touchedMoverIds = new Set<string>();

      for (const target of targets) {
        const reviewSeed = reviewByRequestKey.get(target.requestKey);

        if (!reviewSeed) {
          continue;
        }

        // estimateId unique — 재실행 시 중복 생성 없이 내용만 갱신
        await tx.review.upsert({
          where: {
            estimateId: target.estimateId,
          },
          create: {
            customerId: target.customerId,
            moverId: target.moverId,
            estimateId: target.estimateId,
            rating: reviewSeed.rating,
            content: reviewSeed.content,
          },
          update: {
            customerId: target.customerId,
            moverId: target.moverId,
            rating: reviewSeed.rating,
            content: reviewSeed.content,
          },
        });

        touchedMoverIds.add(target.moverId);
        console.log(`  ✅ 리뷰 upsert: ${reviewSeed.moverEmail} / ${target.requestKey}`);
      }

      /*
       * 리뷰 시드를 만든 기사님만 통계를 갱신합니다.
       * (리뷰가 없는 기사의 movers.ts 테스트용 평점/리뷰 수는 유지)
       */
      for (const moverId of touchedMoverIds) {
        const mover = await tx.user.findUnique({
          where: { id: moverId },
          select: {
            email: true,
            moverProfile: { select: { id: true } },
          },
        });

        if (!mover?.moverProfile) {
          console.log(`  ⚠️ 프로필이 없어 통계 갱신을 건너뜁니다: ${moverId}`);
          continue;
        }

        const stats = await tx.review.aggregate({
          where: { moverId },
          _avg: { rating: true },
          _count: { _all: true },
        });

        const averageRating = Math.round((stats._avg.rating ?? 0) * 10) / 10;

        await tx.moverProfile.update({
          where: { userId: moverId },
          data: {
            averageRating: new Prisma.Decimal(averageRating),
            reviewCount: stats._count._all,
          },
        });

        console.log(
          `  ✅ 프로필 통계 갱신: ${mover.email} / reviewCount=${stats._count._all} / rating=${averageRating}`,
        );
      }
    },
    {
      maxWait: 15_000,
      timeout: 120_000,
    },
  );

  console.log(`⭐ 리뷰 ${targets.length}개 생성 및 프로필 통계 갱신 완료`);
}
