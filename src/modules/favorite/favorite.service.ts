import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { favoriteRepository } from "./favorite.repository";
import type { FavoriteMoverParams } from "./favorite.type";

export const favoriteService = {
  async createFavoriteMover(params: FavoriteMoverParams) {
    const mover = await favoriteRepository.findMoverById(params.moverId);

    if (!mover) {
      throw new AppError("MOVER_NOT_FOUND");
    }

    try {
      await favoriteRepository.createFavoriteMover(params);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // 이미 찜한 상태라면 현재 상태를 그대로 성공 처리
        return {
          moverId: params.moverId,
          isFavorite: true,
        };
      }

      throw error;
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
