import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";

import { moverRepository } from "./mover.repository";
import type { ListMoverQuery } from "./mover.type";

// 목록 조회 repository 결과에서 기사 1명의 타입
type MoverBase = Awaited<ReturnType<typeof moverRepository.findMany>>["movers"][number];

// 상세 조회 repository 결과에서 null을 제외한 기사 타입
type MoverDetail = NonNullable<Awaited<ReturnType<typeof moverRepository.findByMoverUserId>>>;

// 기사 목록/상세 응답에 공통으로 들어가는 필드
function mapMoverBase(mover: MoverBase | MoverDetail, isFavorite = false) {
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
    isFavorite,
  };
}

// 상세 응답에서만 필요한 서비스 가능 지역 추가
function mapMoverDetail(mover: MoverDetail, isFavorite = false) {
  return {
    ...mapMoverBase(mover, isFavorite),
    serviceAreas: mover.serviceAreas.map((serviceArea) => ({
      id: serviceArea.region.id,
      name: serviceArea.region.name,
    })),
  };
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

    // 기사별 찜 여부를 개별 조회하지 않도록 목록 기준으로 한 번에 조회
    const favoriteMoverIds =
      customerId && movers.length > 0
        ? await moverRepository.findFavoriteMoverIds({
            customerId,
            moverIds: movers.map((mover) => mover.userId),
          })
        : [];

    const favoriteMoverIdSet = new Set(favoriteMoverIds);

    return {
      movers: movers.map((mover) => mapMoverBase(mover, favoriteMoverIdSet.has(mover.userId))),
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

    return mapMoverDetail(mover, isFavorite);
  },
};
