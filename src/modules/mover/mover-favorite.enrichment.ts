import { favoriteRepository } from "../favorite/favorite.repository";

// 목록 응답의 isFavorite 계산을 위해 찜한 기사 ID를 Set으로 변환
export async function getFavoriteMoverIdSet(customerId: string | undefined, moverIds: string[]) {
  if (!customerId || moverIds.length === 0) {
    return new Set<string>();
  }

  const favorites = await favoriteRepository.findFavoriteMoversByCustomerId({
    customerId,
    moverIds,
  });

  return new Set(favorites.map((favorite) => favorite.moverId));
}

export async function isMoverFavoritedByCustomer(
  customerId: string | undefined,
  moverId: string,
): Promise<boolean> {
  if (!customerId) {
    return false;
  }

  const favorite = await favoriteRepository.findFavoriteMover({ customerId, moverId });

  return favorite !== null;
}
