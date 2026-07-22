import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { ListMoverQuery } from "./mover.type";

// 기사님 목록 조회 응답에 필요한 필드
const moverListSelect = {
  id: true,
  userId: true,
  nickname: true,
  imageUrl: true,
  career: true,
  shortIntro: true,
  confirmedCount: true,
  averageRating: true,
  reviewCount: true,
  serviceAreas: {
    select: {
      region: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
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

const sortMap = {
  reviewCount: { reviewCount: "desc" },
  rating: { averageRating: "desc" },
  career: { career: "desc" },
  confirmedCount: { confirmedCount: "desc" },
} satisfies Record<ListMoverQuery["sort"], Prisma.MoverProfileOrderByWithRelationInput>;

// 검색어, 지역, 이사 유형 필터를 Prisma where 조건으로 변환
function buildWhere(query: ListMoverQuery): Prisma.MoverProfileWhereInput {
  return {
    user: {
      role: "MOVER",
      isActive: true,
      isProfileCompleted: true,
      deletedAt: null,
    },
    ...(query.keyword && {
      nickname: {
        contains: query.keyword,
        mode: "insensitive",
      },
    }),
    ...(query.serviceArea && {
      serviceAreas: {
        some: {
          regionId: query.serviceArea,
        },
      },
    }),
    ...(query.moveType && {
      serviceTypes: {
        some: {
          moveType: query.moveType,
        },
      },
    }),
  };
}

export const moverRepository = {
  async findMany(params: { query: ListMoverQuery; skip: number; take: number }) {
    const where = buildWhere(params.query);

    const [movers, totalCount] = await Promise.all([
      prisma.moverProfile.findMany({
        where,
        select: moverListSelect,
        orderBy: [sortMap[params.query.sort], { id: "asc" }], // 같은 정렬값일 때 조회 순서 고정
        skip: params.skip,
        take: params.take,
      }),
      prisma.moverProfile.count({ where }),
    ]);

    return {
      items: movers.map((mover) => ({
        id: mover.userId,
        moverProfileId: mover.id,
        nickname: mover.nickname,
        profileImageUrl: mover.imageUrl,
        shortIntro: mover.shortIntro,
        career: mover.career,
        rating: Number(mover.averageRating),
        reviewCount: mover.reviewCount,
        confirmedEstimateCount: mover.confirmedCount,
        favoriteCount: mover.user._count.favoritesReceived,
        serviceAreas: mover.serviceAreas.map((serviceArea) => ({
          id: serviceArea.region.id,
          name: serviceArea.region.name,
        })),
        moveTypes: mover.serviceTypes.map((serviceType) => serviceType.moveType),
      })),
      totalCount,
    };
  },
};
