import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { buildActiveMoverUserWhere, MOVER_LIST_SELECT } from "../mover/mover.query";
import type {
  DeleteFavoriteMoversByCustomerIdParams,
  FavoriteMoverParams,
  FindFavoriteMoverListParams,
  FindFavoriteMoversByCustomerIdParams,
} from "./favorite.type";

type Db = PrismaClient | Prisma.TransactionClient;

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
    return prisma.favoriteMover.deleteMany({
      where: {
        customerId,
        moverId,
      },
    });
  },

  deleteFavoriteMoversByCustomerId(
    { customerId, moverIds, excludedIds }: DeleteFavoriteMoversByCustomerIdParams,
    db: Db = prisma,
  ) {
    const where: Prisma.FavoriteMoverWhereInput = { customerId };

    if (moverIds && moverIds.length > 0) {
      where.moverId = { in: moverIds };
    } else if (excludedIds && excludedIds.length > 0) {
      where.moverId = { notIn: excludedIds };
    }

    return db.favoriteMover.deleteMany({ where });
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

  findFavoriteMoverList({ customerId, cursor, take }: FindFavoriteMoverListParams) {
    return prisma.favoriteMover.findMany({
      where: {
        ...buildFavoriteMoverListWhere(customerId),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                {
                  createdAt: cursor.createdAt,
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
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
      take,
    });
  },

  countFavoriteMoversByCustomerId(customerId: string) {
    return prisma.favoriteMover.count({
      where: buildFavoriteMoverListWhere(customerId),
    });
  },
};
