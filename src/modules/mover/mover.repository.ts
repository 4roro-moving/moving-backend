import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { MoverListSort, FindManyMoversParams } from "./mover.type";

// 기사 목록 조회 응답에 필요한 필드
const moverListSelect = {
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

const sortMap = {
  reviewCount: { reviewCount: "desc" },
  rating: { averageRating: "desc" },
  career: { career: "desc" },
  confirmedCount: { confirmedCount: "desc" },
} satisfies Record<MoverListSort, Prisma.MoverProfileOrderByWithRelationInput>;

// 검색어, 지역, 이사 유형 필터를 Prisma where 조건으로 변환
function buildWhere(params: FindManyMoversParams): Prisma.MoverProfileWhereInput {
  return {
    user: {
      role: "MOVER",
      isActive: true,
      isProfileCompleted: true,
      deletedAt: null,
    },
    ...(params.keyword && {
      nickname: {
        contains: params.keyword,
        mode: "insensitive",
      },
    }),
    ...(params.serviceArea && {
      serviceAreas: {
        some: {
          regionId: params.serviceArea,
        },
      },
    }),
    ...(params.moveType && {
      serviceTypes: {
        some: {
          moveType: params.moveType,
        },
      },
    }),
  };
}

export const moverRepository = {
  async findMany(params: FindManyMoversParams) {
    const where = buildWhere(params);

    const [movers, totalCount] = await Promise.all([
      prisma.moverProfile.findMany({
        where,
        select: moverListSelect,
        orderBy: [sortMap[params.sort], { id: "asc" }], // 같은 정렬값일 때 조회 순서 고정
        skip: params.skip,
        take: params.take,
      }),
      prisma.moverProfile.count({ where }),
    ]);

    return {
      movers,
      totalCount,
    };
  },
};
