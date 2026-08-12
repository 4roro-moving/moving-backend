import { Prisma } from "@prisma/client";

import type { BulkDeleteFavoriteMoversParams } from "./favorite.type";

type NormalizedBulkDeleteFavoriteMoversInput = {
  moverIds: string[] | undefined;
  excludedIds: string[];
};

export function isFavoriteMoverUniqueError(error: unknown) {
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

export function normalizeBulkDeleteFavoriteMoversInput({
  moverIds,
  excludedIds,
}: Pick<
  BulkDeleteFavoriteMoversParams,
  "moverIds" | "excludedIds"
>): NormalizedBulkDeleteFavoriteMoversInput {
  return {
    moverIds: moverIds ? [...new Set(moverIds)] : undefined,
    excludedIds: excludedIds ? [...new Set(excludedIds)] : [],
  };
}
