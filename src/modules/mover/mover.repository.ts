import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { MoverListSort, FindManyMoversParams } from "./mover.type";

type Db = PrismaClient | Prisma.TransactionClient;

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

  // 기사님 리뷰 별점 분포 (트랜잭션 재사용을 위해 db 주입)
  countRatingDistributionByMoverId(moverId: string, db: Db = prisma) {
    return db.review.groupBy({
      by: ["rating"],
      where: {
        moverId,
      },
      _count: {
        _all: true,
      },
    });
  },
};
