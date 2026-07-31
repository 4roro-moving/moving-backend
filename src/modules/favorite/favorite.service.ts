import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";

import { mapMoverBase } from "../mover/mover.shared";
import { favoriteRepository } from "./favorite.repository";
import type {
  BulkDeleteFavoriteMoversParams,
  FavoriteMoverCursor,
  FavoriteMoverParams,
  ListFavoriteMoverQuery,
} from "./favorite.type";

type GetFavoriteMoverListParams = ListFavoriteMoverQuery & {
  customerId: string;
};

type SerializedFavoriteMoverCursor = {
  createdAt: string;
  id: number;
};

export function encodeFavoriteMoverCursor(cursor: FavoriteMoverCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    } satisfies SerializedFavoriteMoverCursor),
  ).toString("base64url");
}

export function decodeFavoriteMoverCursor(
  cursor: string | undefined,
): FavoriteMoverCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<SerializedFavoriteMoverCursor>;
    const createdAt = new Date(decoded.createdAt ?? "");

    if (
      Number.isNaN(createdAt.getTime()) ||
      !Number.isInteger(decoded.id) ||
      (decoded.id ?? 0) <= 0
    ) {
      throw new Error("Invalid cursor");
    }

    return { createdAt, id: decoded.id as number };
  } catch {
    throw new AppError("VALIDATION_ERROR", {
      message: "유효하지 않은 찜 목록 커서입니다.",
    });
  }
}

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
      const { count: deletedCount } = await favoriteRepository.deleteFavoriteMoversByCustomerId({
        customerId,
        excludedIds: uniqueExcludedIds,
      });

      return { deletedCount };
    }

    const ids = uniqueMoverIds ?? [];
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
          ...mapMoverBase(mover),
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
