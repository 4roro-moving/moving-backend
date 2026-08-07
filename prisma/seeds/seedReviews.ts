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

  // 리뷰가 실제로 달리는 기사(=통계 재계산 대상)의 moverId 를 모읍니다.
  const statMoverIds = new Set<string>();
  let reviewedCount = 0;
  let pendingCount = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const target of targets) {
        const reviewSeed = reviewByRequestKey.get(target.requestKey);

        if (!reviewSeed) {
          continue;
        }

        /*
         * rating 이 null 인 건은 "리뷰 미작성" 상태로 둡니다.
         * (COMPLETED 요청 + CONFIRMED 견적만 존재 → 고객이 직접 리뷰 작성 가능)
         */
        if (reviewSeed.rating === null || reviewSeed.content === null) {
          pendingCount += 1;
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

        statMoverIds.add(target.moverId);
        reviewedCount += 1;
      }

      const seedMovers = await tx.user.findMany({
        where: {
          id: {
            in: [...statMoverIds],
          },
          role: "MOVER",
        },
        select: {
          id: true,
          email: true,
          moverProfile: {
            select: {
              id: true,
            },
          },
        },
      });

      /*
       * 리뷰 시드 대상 기사님 전체의 통계를 실제 Review row 기준으로 맞춥니다.
       * 리뷰가 0개가 된 기사님도 reviewCount=0, averageRating=0으로 갱신됩니다.
       */
      for (const mover of seedMovers) {
        if (!mover.moverProfile) {
          console.log(`  ⚠️ 프로필이 없어 통계 갱신을 건너뜁니다: ${mover.email}`);
          continue;
        }

        const stats = await tx.review.aggregate({
          where: {
            moverId: mover.id,
          },
          _avg: {
            rating: true,
          },
          _count: {
            _all: true,
          },
        });

        const averageRating = Math.round((stats._avg.rating ?? 0) * 10) / 10;

        await tx.moverProfile.update({
          where: {
            userId: mover.id,
          },
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

  console.log(
    `⭐ 리뷰 ${reviewedCount}개 작성 / ${pendingCount}개 미작성(리뷰 대기) · 프로필 통계 갱신 완료`,
  );
}
