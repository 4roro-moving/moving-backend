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

    let isNew = true;
    try {
      await favoriteRepository.createFavoriteMover(params);
    } catch (error) {
      // 고객-기사님 복합 unique 충돌인 경우에만 성공 처리, 다른 unique 에러는 에러 처리
      if (!isFavoriteMoverUniqueError(error)) {
        throw error;
      }
      isNew = false;
    }

    return {
      moverId: params.moverId,
      isFavorite: true,
      isNew,
    };
  },

  async deleteFavoriteMover(params: FavoriteMoverParams) {
    const mover = await favoriteRepository.findMoverById(params.moverId);

    if (!mover) {
      throw new AppError("MOVER_NOT_FOUND");
    }

    await favoriteRepository.deleteFavoriteMover(params);

    return {
      moverId: params.moverId,
      isFavorite: false,
    };
  },
};
