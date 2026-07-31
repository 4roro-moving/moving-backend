import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";

import { mapMoverBase } from "../mover/mover.shared";
import { favoriteRepository } from "./favorite.repository";
import type {
  BulkDeleteFavoriteMoversParams,
  FavoriteMoverParams,
  ListFavoriteMoverQuery,
} from "./favorite.type";

type GetFavoriteMoverListParams = ListFavoriteMoverQuery & {
  customerId: string;
};

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
      // 고객-기사님 복합 unique 충돌인 경우에만 성공 처리, 다른 unique 에러는 에러 처리
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
    // deleteMany는 멱등 처리이므로 비활성·삭제된 기사 찜도 해제 가능해야 함
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
    const uniqueMoverIds = moverIds ? [...new Set(moverIds)] : undefined;
    const uniqueExcludedIds = excludedIds ? [...new Set(excludedIds)] : [];

    if (all === true) {
      const targets = await favoriteRepository.findFavoriteMoverIdsByCustomerId({
        customerId,
        excludedIds: uniqueExcludedIds,
      });
      const deletedIds = targets.map((row) => row.moverId);

      if (deletedIds.length > 0) {
        await favoriteRepository.deleteFavoriteMoversByCustomerId({
          customerId,
          moverIds: deletedIds,
        });
      }

      return { deletedIds, failedIds: [] as string[] };
    }

    const ids = uniqueMoverIds ?? [];
    if (ids.length === 0) {
      return { deletedIds: [] as string[], failedIds: [] as string[] };
    }

    await favoriteRepository.deleteFavoriteMoversByCustomerId({
      customerId,
      moverIds: ids,
    });

    // 단건 DELETE와 동일하게 멱등 — 요청한 id는 모두 해제된 것으로 응답
    return { deletedIds: ids, failedIds: [] as string[] };
  },

  async getFavoriteMoverList({ customerId, page, limit }: GetFavoriteMoverListParams) {
    const skip = (page - 1) * limit;

    const [favorites, totalCount] = await Promise.all([
      favoriteRepository.findFavoriteMoverList({
        customerId,
        skip,
        take: limit,
      }),
      favoriteRepository.countFavoriteMoversByCustomerId(customerId),
    ]);

    return {
      movers: favorites.map((favorite) => {
        const mover = favorite.mover.moverProfile;

        if (!mover) {
          throw new AppError("INTERNAL_SERVER_ERROR", {
            message: "기사님 프로필 정보를 찾을 수 없습니다.",
          });
        }

        return {
          ...mapMoverBase(mover),
          isFavorite: true,
          favoritedAt: favorite.createdAt,
        };
      }),
      pagination: buildPagination(totalCount, page, limit),
    };
  },
};
