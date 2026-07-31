import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { buildActiveMoverUserWhere, MOVER_LIST_SELECT } from "../mover/mover.shared";
import type {
  DeleteFavoriteMoversByCustomerIdParams,
  FavoriteMoverParams,
  FindFavoriteMoverListParams,
  FindFavoriteMoversByCustomerIdParams,
} from "./favorite.type";

// 찜 목록 조회와 전체 개수 조회에 동일하게 적용할 조건
function buildFavoriteMoverListWhere(customerId: string): Prisma.FavoriteMoverWhereInput {
  return {
    customerId,
    mover: buildActiveMoverUserWhere(),
  };
}

export const favoriteRepository = {
  findMoverById(moverId: string) {
    return prisma.user.findFirst({
      where: {
        id: moverId,
        ...buildActiveMoverUserWhere(),
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

  /** 고객 찜 일괄 삭제. moverIds가 있으면 해당 id만, 없으면 excludedIds 제외 전체 */
  deleteFavoriteMoversByCustomerId({
    customerId,
    moverIds,
    excludedIds,
  }: DeleteFavoriteMoversByCustomerIdParams) {
    const where: Prisma.FavoriteMoverWhereInput = { customerId };

    if (moverIds && moverIds.length > 0) {
      where.moverId = { in: moverIds };
    } else if (excludedIds && excludedIds.length > 0) {
      where.moverId = { notIn: excludedIds };
    }

    return prisma.favoriteMover.deleteMany({ where });
  },

  /** 삭제 대상 moverId 목록 조회 (응답 deletedIds용) */
  findFavoriteMoverIdsByCustomerId({
    customerId,
    moverIds,
    excludedIds,
  }: DeleteFavoriteMoversByCustomerIdParams) {
    const where: Prisma.FavoriteMoverWhereInput = { customerId };

    if (moverIds && moverIds.length > 0) {
      where.moverId = { in: moverIds };
    } else if (excludedIds && excludedIds.length > 0) {
      where.moverId = { notIn: excludedIds };
    }

    return prisma.favoriteMover.findMany({
      where,
      select: { moverId: true },
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
              select: MOVER_LIST_SELECT,
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
