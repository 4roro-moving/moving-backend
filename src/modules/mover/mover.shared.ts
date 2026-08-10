import type { Prisma } from "@prisma/client";

import { getProfileImageUrl } from "../../utils/image-url";

// 기사 목록·찜 목록 조회 시 공통으로 가져올 MoverProfile 필드
export const MOVER_LIST_SELECT = {
  id: true,
  userId: true,
  nickname: true,
  imageUrl: true,
  career: true,
  shortIntro: true,
  description: true,
  confirmedCount: true,
  averageRating: true,
  reviewCount: true,
  serviceTypes: {
    select: {
      moveType: true,
    },
  },
  user: {
    select: {
      _count: {
        select: {
          favoritesReceived: true,
        },
      },
    },
  },
} satisfies Prisma.MoverProfileSelect;

export type MoverListItem = Prisma.MoverProfileGetPayload<{
  select: typeof MOVER_LIST_SELECT;
}>;

// 노출 가능한 활성 기사 User 조건
export function buildActiveMoverUserWhere(): Prisma.UserWhereInput {
  return {
    role: "MOVER",
    isActive: true,
    isProfileCompleted: true,
    deletedAt: null,
  };
}

// 기사 목록/상세 응답에 공통으로 들어가는 필드
export function mapMoverBase(mover: MoverListItem) {
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
