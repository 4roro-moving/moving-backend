import type { Prisma } from "@prisma/client";

import type { MOVER_LIST_SELECT } from "./mover.select";

export type MoverListItem = Prisma.MoverProfileGetPayload<{
  select: typeof MOVER_LIST_SELECT;
}>;

// 기사 목록/상세 응답에 공통으로 들어가는 필드
export function mapMoverBase(mover: MoverListItem) {
  return {
    id: mover.userId,
    moverProfileId: mover.id,
    nickname: mover.nickname,
    profileImageUrl: mover.imageUrl,
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
