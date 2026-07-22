import { AppError } from "../../lib/app-error";
import { favoriteRepository } from "./favorite.repository";
import type { FavoriteMoverParams } from "./favorite.type";

export const favoriteService = {
  async createFavoriteMover(params: FavoriteMoverParams) {
    const mover = await favoriteRepository.findMoverById(params.moverId);

    if (!mover) {
      throw new AppError("MOVER_NOT_FOUND");
    }

    const favoriteMover = await favoriteRepository.findFavoriteMover(params);

    // 이미 찜한 상태라면 추가 생성 없이 현재 상태만 반환
    if (!favoriteMover) {
      await favoriteRepository.createFavoriteMover(params);
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
