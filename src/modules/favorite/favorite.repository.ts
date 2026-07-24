import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type {
  FavoriteMoverParams,
  FindFavoriteMoverListParams,
  FindFavoriteMoversByCustomerIdParams,
} from "./favorite.type";

// 찜한 기사 목록 조회 시 DB에서 가져올 필드 목록
const FAVORITE_MOVER_LIST_SELECT = {
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

// 찜 목록 조회와 전체 개수 조회에 동일하게 적용할 조건
function buildFavoriteMoverListWhere(customerId: string): Prisma.FavoriteMoverWhereInput {
  return {
    customerId,
    mover: {
      role: "MOVER",
      isActive: true,
      isProfileCompleted: true,
      deletedAt: null,
    },
  };
}

export const favoriteRepository = {
  findMoverById(moverId: string) {
    return prisma.user.findFirst({
      where: {
        id: moverId,
        role: "MOVER",
        isActive: true,
        isProfileCompleted: true,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
  },

  findFavoriteMover({ customerId, moverId }: FavoriteMoverParams) {
    return prisma.favoriteMover.findUnique({
      where: {
        customerId_moverId: {
          customerId,
          moverId,
        },
      },
      select: {
        id: true,
      },
    });
  },

  createFavoriteMover({ customerId, moverId }: FavoriteMoverParams) {
    return prisma.favoriteMover.create({
      data: {
        customerId,
        moverId,
      },
    });
  },

  deleteFavoriteMover({ customerId, moverId }: FavoriteMoverParams) {
    // 이미 해제된 찜도 성공 처리하기 위해 deleteMany 사용
    return prisma.favoriteMover.deleteMany({
      where: {
        customerId,
        moverId,
      },
    });
  },

  findFavoriteMoversByCustomerId({ customerId, moverIds }: FindFavoriteMoversByCustomerIdParams) {
    return prisma.favoriteMover.findMany({
      where: {
        customerId,
        moverId: { in: moverIds },
      },
      select: { moverId: true },
    });
  },

  findFavoriteMoverList({ customerId, skip, take }: FindFavoriteMoverListParams) {
    return prisma.favoriteMover.findMany({
      where: buildFavoriteMoverListWhere(customerId),
      select: {
        createdAt: true,
        mover: {
          select: {
            moverProfile: {
              select: FAVORITE_MOVER_LIST_SELECT,
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    });
  },

  countFavoriteMoversByCustomerId(customerId: string) {
    return prisma.favoriteMover.count({
      where: buildFavoriteMoverListWhere(customerId),
    });
  },
};
