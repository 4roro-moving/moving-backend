import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";

import { moverRepository } from "./mover.repository";
import type { ListMoverQuery } from "./mover.type";

// 목록 조회 repository 결과에서 기사 1명의 타입
type MoverBase = Awaited<ReturnType<typeof moverRepository.findMany>>["movers"][number];

// 상세 조회 repository 결과에서 null을 제외한 기사 타입
type MoverDetail = NonNullable<Awaited<ReturnType<typeof moverRepository.findByMoverUserId>>>;

// 기사 목록/상세 응답에 공통으로 들어가는 필드
function mapMoverBase(mover: MoverBase | MoverDetail) {
  return {
    id: mover.userId,
    moverProfileId: mover.id,
    nickname: mover.nickname,
    profileImageUrl: mover.imageUrl,
    shortIntro: mover.shortIntro,
    description: mover.description,
    career: mover.career,
    rating: Number(mover.averageRating),
    reviewCount: mover.reviewCount,
    confirmedEstimateCount: mover.confirmedCount,
    favoriteCount: mover.user._count.favoritesReceived,
    moveTypes: mover.serviceTypes.map((serviceType) => serviceType.moveType),
  };
}

// 상세 응답에서만 필요한 서비스 가능 지역 추가
function mapMoverDetail(mover: MoverDetail) {
  return {
    ...mapMoverBase(mover),
    serviceAreas: mover.serviceAreas.map((serviceArea) => ({
      id: serviceArea.region.id,
      name: serviceArea.region.name,
    })),
  };
}

// 목록 응답의 isFavorite 계산하기 위해 찜한 기사 ID를 Set으로 변환
async function getFavoriteMoverIdSet(customerId: string | undefined, moverIds: string[]) {
  if (!customerId || moverIds.length === 0) {
    return new Set<string>();
  }

  const favoriteMoverIds = await moverRepository.findFavoriteMoverIds({
    customerId,
    moverIds,
  });

  return new Set(favoriteMoverIds);
}

export const moverService = {
  async getMoverList(query: ListMoverQuery, customerId?: string) {
    const { keyword, sort, serviceArea, moveType, page, limit } = query;

    const { movers, totalCount } = await moverRepository.findMany({
      sort,
      skip: (page - 1) * limit,
      take: limit,
      ...(keyword !== undefined && { keyword }),
      ...(serviceArea !== undefined && { serviceArea }),
      ...(moveType !== undefined && { moveType }),
    });

    const favoriteMoverIdSet = await getFavoriteMoverIdSet(
      customerId,
      movers.map((mover) => mover.userId),
    );

    return {
      movers: movers.map((mover) => ({
        ...mapMoverBase(mover),
        isFavorite: favoriteMoverIdSet.has(mover.userId),
      })),
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  async getMoverDetail(moverUserId: string, customerId?: string) {
    const mover = await moverRepository.findByMoverUserId(moverUserId);

    if (!mover) {
      throw new AppError("MOVER_NOT_FOUND");
    }

    const isFavorite = customerId
      ? await moverRepository.existsFavoriteMover({
          customerId,
          moverId: moverUserId,
        })
      : false;

    return {
      ...mapMoverDetail(mover),
      isFavorite,
    };
  },
};
