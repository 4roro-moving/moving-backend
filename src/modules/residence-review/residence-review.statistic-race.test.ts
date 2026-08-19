import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";

import "dotenv/config";

import { prisma } from "../../lib/prisma";
import { residenceReviewService } from "./residence-review.service";
import { REGION_REVIEW_STATISTIC, RESIDENCE_REVIEW_VISIBILITY } from "./residence-review.type";

/**
 * 동일 지역 후기 생성/삭제/평점 변경이 동시에 일어날 때
 * RegionReviewStatistic 이 노출 후기 aggregate 와 일치하는지 검증합니다.
 */

type RaceFixture = {
  regionId: number;
  authorIds: string[];
};

function roundAverageRating(ratingSum: number, reviewCount: number): number {
  if (reviewCount === 0) {
    return 0;
  }

  const factor = 10 ** REGION_REVIEW_STATISTIC.AVERAGE_DECIMAL_PLACES;

  return Math.round((ratingSum / reviewCount) * factor) / factor;
}

function reviewInput(regionId: number, rating: number, suffix: string) {
  return {
    regionId,
    title: `동시성 후기 ${suffix}`,
    content: `동시성 통계 검증용 거주후기 ${suffix}`,
    rating,
  };
}

async function createCustomer(suffix: string) {
  return prisma.user.create({
    data: {
      email: `residence-review-race-${suffix}@test.local`,
      name: `거주후기경쟁고객-${suffix}`,
      password: "test-password-hash",
      role: UserRole.CUSTOMER,
    },
  });
}

async function createRaceFixture(authorCount: number): Promise<RaceFixture> {
  const suffix = randomUUID().slice(0, 8);
  const region = await prisma.region.create({
    data: {
      name: `거주후기경쟁지역-${suffix}`,
      latitude: 37.5665,
      longitude: 126.978,
    },
  });

  const authors = await Promise.all(
    Array.from({ length: authorCount }, (_, index) => createCustomer(`${suffix}-${String(index)}`)),
  );

  return {
    regionId: region.id,
    authorIds: authors.map((author) => author.id),
  };
}

async function cleanupRaceFixture(fixture: RaceFixture): Promise<void> {
  await prisma.residenceReview.deleteMany({ where: { regionId: fixture.regionId } });
  await prisma.regionReviewStatistic.deleteMany({ where: { regionId: fixture.regionId } });
  await prisma.user.deleteMany({ where: { id: { in: fixture.authorIds } } });
  await prisma.region.deleteMany({ where: { id: fixture.regionId } });
}

async function assertStatisticMatchesVisibleReviews(regionId: number): Promise<void> {
  const aggregated = await prisma.residenceReview.aggregate({
    where: {
      regionId,
      isHidden: RESIDENCE_REVIEW_VISIBILITY.PUBLIC,
    },
    _sum: { rating: true },
    _count: { _all: true },
  });

  const reviewCount = aggregated._count._all;
  const ratingSum = aggregated._sum.rating ?? 0;
  const statistic = await prisma.regionReviewStatistic.findUnique({
    where: { regionId },
  });

  assert.ok(statistic, "RegionReviewStatistic row 가 있어야 합니다.");
  assert.equal(statistic.ratingSum, ratingSum);
  assert.equal(statistic.reviewCount, reviewCount);
  assert.equal(Number(statistic.averageRating), roundAverageRating(ratingSum, reviewCount));
}

const runDbIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "1";

(runDbIntegration ? describe : describe.skip)("거주후기 통계 경쟁 상황 (PostgreSQL)", () => {
  it("같은 지역에 후기 2건을 동시에 생성하면 통계가 노출 후기 aggregate 와 일치한다", async () => {
    const fixture = await createRaceFixture(2);
    const [firstAuthorId, secondAuthorId] = fixture.authorIds;

    try {
      assert.ok(firstAuthorId);
      assert.ok(secondAuthorId);

      const results = await Promise.allSettled([
        residenceReviewService.createResidenceReview(
          firstAuthorId,
          reviewInput(fixture.regionId, 5, "create-a"),
        ),
        residenceReviewService.createResidenceReview(
          secondAuthorId,
          reviewInput(fixture.regionId, 3, "create-b"),
        ),
      ]);

      assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);

      const reviews = await prisma.residenceReview.findMany({
        where: { regionId: fixture.regionId },
      });
      assert.equal(reviews.length, 2);

      await assertStatisticMatchesVisibleReviews(fixture.regionId);
    } finally {
      await cleanupRaceFixture(fixture);
    }
  });

  it("같은 지역에서 후기 생성과 삭제를 동시에 실행하면 통계가 노출 후기 aggregate 와 일치한다", async () => {
    const fixture = await createRaceFixture(2);
    const [firstAuthorId, secondAuthorId] = fixture.authorIds;

    try {
      assert.ok(firstAuthorId);
      assert.ok(secondAuthorId);

      const existing = await residenceReviewService.createResidenceReview(
        firstAuthorId,
        reviewInput(fixture.regionId, 4, "existing"),
      );

      const results = await Promise.allSettled([
        residenceReviewService.createResidenceReview(
          secondAuthorId,
          reviewInput(fixture.regionId, 2, "created"),
        ),
        residenceReviewService.deleteResidenceReview(existing.id, firstAuthorId),
      ]);

      assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);

      const remaining = await prisma.residenceReview.findMany({
        where: { regionId: fixture.regionId },
      });
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0]?.rating, 2);

      await assertStatisticMatchesVisibleReviews(fixture.regionId);
    } finally {
      await cleanupRaceFixture(fixture);
    }
  });

  it("같은 지역 후기 2건의 평점을 동시에 변경하면 통계가 노출 후기 aggregate 와 일치한다", async () => {
    const fixture = await createRaceFixture(2);
    const [firstAuthorId, secondAuthorId] = fixture.authorIds;

    try {
      assert.ok(firstAuthorId);
      assert.ok(secondAuthorId);

      const firstReview = await residenceReviewService.createResidenceReview(
        firstAuthorId,
        reviewInput(fixture.regionId, 3, "rating-a"),
      );
      const secondReview = await residenceReviewService.createResidenceReview(
        secondAuthorId,
        reviewInput(fixture.regionId, 4, "rating-b"),
      );

      assert.ok(firstReview);
      assert.ok(secondReview);

      const results = await Promise.allSettled([
        residenceReviewService.updateResidenceReview(firstReview.id, firstAuthorId, { rating: 5 }),
        residenceReviewService.updateResidenceReview(secondReview.id, secondAuthorId, {
          rating: 1,
        }),
      ]);

      assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);

      const reviews = await prisma.residenceReview.findMany({
        where: { regionId: fixture.regionId },
        orderBy: { id: "asc" },
      });
      assert.equal(reviews.length, 2);
      assert.deepEqual(reviews.map((review) => review.rating).sort(), [1, 5]);

      await assertStatisticMatchesVisibleReviews(fixture.regionId);
    } finally {
      await cleanupRaceFixture(fixture);
    }
  });
});
