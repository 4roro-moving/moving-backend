import type { Prisma } from "@prisma/client";

import { getProfileImageUrl } from "../../utils/image-url";
import { RATING_SCORES } from "./mover.constants";
import type { MOVER_DETAIL_SELECT, MOVER_LIST_SELECT } from "./mover.query";

export type MoverListItem = Prisma.MoverProfileGetPayload<{
  select: typeof MOVER_LIST_SELECT;
}>;

export type MoverDetailItem = Prisma.MoverProfileGetPayload<{
  select: typeof MOVER_DETAIL_SELECT;
}>;

type RatingDistributionRow = {
  rating: number;
  _count: {
    _all: number;
  };
};

export function mapMoverSummary(mover: MoverListItem) {
  return {
    id: mover.userId,
    moverProfileId: mover.id,
    nickname: mover.nickname,
    profileImageUrl: getProfileImageUrl(mover.imageUrl),
    shortIntro: mover.shortIntro,
    description: mover.description,
    career: mover.career,
    rating: Number(mover.averageRating),
    reviewCount: mover.reviewCount,
    confirmedEstimateCount: mover.confirmedCount,
    favoriteCount: mover.user._count.favoritesReceived,
    moveTypes: mover.serviceTypes.map((serviceType) => serviceType.moveType),
  };
}

export function mapMoverDetail(mover: MoverDetailItem) {
  return {
    ...mapMoverSummary(mover),
    serviceAreas: mover.serviceAreas.map((serviceArea) => ({
      id: serviceArea.region.id,
      name: serviceArea.region.name,
    })),
  };
}

export function mapRatingDistribution(rows: RatingDistributionRow[]) {
  const countByScore = new Map(rows.map((row) => [row.rating, row._count._all]));

  return RATING_SCORES.map((score) => ({
    score,
    count: countByScore.get(score) ?? 0,
  }));
}
