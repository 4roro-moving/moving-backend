import { AppError } from "../../lib/app-error";

import { mapMoverSummary } from "../mover/mover.mapper";
import { decodeFavoriteMoverCursor, encodeFavoriteMoverCursor } from "./favorite.cursor";
import {
  isFavoriteMoverUniqueError,
  normalizeBulkDeleteFavoriteMoversInput,
} from "./favorite.policy";
import { favoriteRepository } from "./favorite.repository";
import type {
  BulkDeleteFavoriteMoversParams,
  FavoriteMoverParams,
  ListFavoriteMoverQuery,
} from "./favorite.type";

type GetFavoriteMoverListParams = ListFavoriteMoverQuery & {
  customerId: string;
};

export const favoriteService = {
  async createFavoriteMover({ customerId, moverId }: FavoriteMoverParams) {
    const mover = await favoriteRepository.findMoverById(moverId);

    if (!mover) {
      throw new AppError("MOVER_NOT_FOUND");
    }

    let isNew = true;
    try {
      await favoriteRepository.createFavoriteMover({
        customerId,
        moverId,
      });
    } catch (error) {
      if (!isFavoriteMoverUniqueError(error)) {
        throw error;
      }
      isNew = false;
    }

    return {
      moverId,
      isFavorite: true,
      isNew,
    };
  },

  async deleteFavoriteMover({ customerId, moverId }: FavoriteMoverParams) {
    await favoriteRepository.deleteFavoriteMover({ customerId, moverId });

    return {
      moverId,
      isFavorite: false,
    };
  },

  async deleteFavoriteMovers({
    customerId,
    moverIds,
    all,
    excludedIds,
  }: BulkDeleteFavoriteMoversParams) {
    const normalizedInput = normalizeBulkDeleteFavoriteMoversInput({
      moverIds,
      excludedIds,
    });

    if (all === true) {
      const { count: deletedCount } = await favoriteRepository.deleteFavoriteMoversByCustomerId({
        customerId,
        excludedIds: normalizedInput.excludedIds,
      });

      return { deletedCount };
    }

    const ids = normalizedInput.moverIds ?? [];
    if (ids.length === 0) {
      return { deletedCount: 0 };
    }

    const { count: deletedCount } = await favoriteRepository.deleteFavoriteMoversByCustomerId({
      customerId,
      moverIds: ids,
    });

    return { deletedCount };
  },

  async getFavoriteMoverList({ customerId, cursor, limit }: GetFavoriteMoverListParams) {
    const decodedCursor = decodeFavoriteMoverCursor(cursor);

    const [favorites, totalCount] = await Promise.all([
      favoriteRepository.findFavoriteMoverList({
        customerId,
        ...(decodedCursor ? { cursor: decodedCursor } : {}),
        take: limit + 1,
      }),
      favoriteRepository.countFavoriteMoversByCustomerId(customerId),
    ]);

    const hasNext = favorites.length > limit;
    const pageFavorites = favorites.slice(0, limit);
    const lastFavorite = pageFavorites.at(-1);

    return {
      movers: pageFavorites.map((favorite) => {
        const mover = favorite.mover.moverProfile;

        if (!mover) {
          throw new AppError("INTERNAL_SERVER_ERROR", {
            message: "기사님 프로필 정보를 찾을 수 없습니다.",
          });
        }

        return {
          ...mapMoverSummary(mover),
          isFavorite: true,
          favoritedAt: favorite.createdAt,
        };
      }),
      pagination: {
        limit,
        totalCount,
        hasNext,
        nextCursor:
          hasNext && lastFavorite
            ? encodeFavoriteMoverCursor({
                createdAt: lastFavorite.createdAt,
                id: lastFavorite.id,
              })
            : null,
      },
    };
  },
};
