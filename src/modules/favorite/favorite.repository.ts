import { prisma } from "../../lib/prisma";
import type { FavoriteMoverParams } from "./favorite.type";

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

  findFavoriteMoversByCustomerId({
    customerId,
    moverIds,
  }: {
    customerId: string;
    moverIds: string[];
  }) {
    return prisma.favoriteMover.findMany({
      where: {
        customerId,
        moverId: { in: moverIds },
      },
      select: { moverId: true },
    });
  },
};
