import { Prisma, type PrismaClient } from "@prisma/client";

import type { EstimateRequestSeedKey } from "./estimateRequests.js";
import { REVIEW_SEED_ITEMS } from "./reviewSeeds.js";

export interface ConfirmedEstimateSeedRef {
  requestKey: EstimateRequestSeedKey;
  estimateId: number;
  customerId: string;
  moverId: string;
}

/** COMPLETED 요청에 달린 확정 견적에 Review를 만들고 프로필 통계를 맞춥니다. */
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
      for (const target of targets) {
        const reviewSeed = reviewByRequestKey.get(target.requestKey);

        if (!reviewSeed) {
          continue;
        }

        await tx.review.create({
          data: {
            customerId: target.customerId,
            moverId: target.moverId,
            estimateId: target.estimateId,
            rating: reviewSeed.rating,
            content: reviewSeed.content,
          },
        });

        console.log(`  ✅ 리뷰 생성: ${reviewSeed.moverEmail} / ${target.requestKey}`);
      }

      const movers = await tx.user.findMany({
        where: { role: "MOVER" },
        select: { id: true, email: true },
      });

      /*
       * movers.ts 하드코딩 reviewCount와 실제 Review row 불일치를 없앱니다.
       * 리뷰가 없는 기사님은 0으로 맞춥니다.
       */
      for (const mover of movers) {
        const stats = await tx.review.aggregate({
          where: { moverId: mover.id },
          _avg: { rating: true },
          _count: { _all: true },
        });

        const averageRating = Math.round((stats._avg.rating ?? 0) * 10) / 10;

        await tx.moverProfile.update({
          where: { userId: mover.id },
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
