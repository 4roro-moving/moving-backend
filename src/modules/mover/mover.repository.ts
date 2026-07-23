import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { MoverListSort, FindManyMoversParams } from "./mover.type";

// 기사 목록 조회 시 DB에서 가져올 필드 목록
const MOVER_LIST_SELECT = {
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

// 기사 상세 조회 시 DB에서 가져올 필드 목록
const MOVER_DETAIL_SELECT = {
  ...MOVER_LIST_SELECT,
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
        select: MOVER_LIST_SELECT,
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

  findByMoverUserId(moverUserId: string) {
    return prisma.moverProfile.findFirst({
      where: {
        userId: moverUserId,
        user: {
          role: "MOVER",
          isActive: true,
          isProfileCompleted: true,
          deletedAt: null,
        },
      },
      select: MOVER_DETAIL_SELECT,
    });
  },

  // 목록 조회 결과에 isFavorite을 추가하기 위해 고객이 찜한 기사 ID만 조회
  async findFavoriteMoverIds(params: { customerId: string; moverIds: string[] }) {
    const favorites = await prisma.favoriteMover.findMany({
      where: {
        customerId: params.customerId,
        moverId: {
          in: params.moverIds,
        },
      },
      select: {
        moverId: true,
      },
    });

    return favorites.map((favorite) => favorite.moverId);
  },

  // 상세 조회 결과에 isFavorite을 추가하기 위해 단일 찜 여부 확인
  async existsFavoriteMover(params: { customerId: string; moverId: string }) {
    const favorite = await prisma.favoriteMover.findUnique({
      where: {
        customerId_moverId: {
          customerId: params.customerId,
          moverId: params.moverId,
        },
      },
      select: {
        id: true,
      },
    });

    return favorite !== null;
  },
};
