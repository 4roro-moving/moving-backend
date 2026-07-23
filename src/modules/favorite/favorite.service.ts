import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { favoriteRepository } from "./favorite.repository";
import type { FavoriteMoverParams } from "./favorite.type";

function isFavoriteMoverUniqueError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  const target = error.meta?.target;

  return (
    error.code === "P2002" &&
    Array.isArray(target) &&
    target.includes("customer_id") &&
    target.includes("mover_id")
  );
}

export const favoriteService = {
  async createFavoriteMover(params: FavoriteMoverParams) {
    const mover = await favoriteRepository.findMoverById(params.moverId);

    if (!mover) {
      throw new AppError("MOVER_NOT_FOUND");
    }

    try {
      await favoriteRepository.createFavoriteMover(params);
    } catch (error) {
      if (!isFavoriteMoverUniqueError(error)) {
        throw error;
      }
    }

    return {
      moverId: params.moverId,
      isFavorite: true,
    };
  },

  async deleteFavoriteMover(params: FavoriteMoverParams) {
    const mover = await favoriteRepository.findMoverById(params.moverId);

    if (!mover) {
      throw new AppError("MOVER_NOT_FOUND");
    }

    // 삭제할 찜이 없어도 찜 해제 상태로 응답
    await favoriteRepository.deleteFavoriteMover(params);

    return {
      moverId: params.moverId,
      isFavorite: false,
    };
  },
};
