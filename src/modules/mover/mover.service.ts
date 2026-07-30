import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";

import { favoriteRepository } from "../favorite/favorite.repository";
import { moverRepository } from "./mover.repository";
import type { ListMoverQuery } from "./mover.type";

// 목록 조회 repository 결과에서 기사 1명의 타입
type MoverBase = Awaited<ReturnType<typeof moverRepository.findMany>>["movers"][number];

// 상세 조회 repository 결과에서 null을 제외한 기사 타입
type MoverDetail = NonNullable<Awaited<ReturnType<typeof moverRepository.findByMoverUserId>>>;

type RatingDistributionRow = Awaited<
  ReturnType<typeof moverRepository.countRatingDistributionByMoverId>
>[number];

// 없는 점수도 0으로 채우기 위해 5→1 고정
const RATING_SCORES = [5, 4, 3, 2, 1] as const;

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

// groupBy 결과를 5~1점 고정 배열로 변환 (없는 점수는 0)
function mapRatingDistribution(rows: RatingDistributionRow[]) {
  const countByScore = new Map(rows.map((row) => [row.rating, row._count._all]));

  return RATING_SCORES.map((score) => ({
    score,
    count: countByScore.get(score) ?? 0,
  }));
}

// 목록 응답의 isFavorite 계산을 위해 찜한 기사 ID를 Set으로 변환
async function getFavoriteMoverIdSet(customerId: string | undefined, moverIds: string[]) {
  if (!customerId || moverIds.length === 0) {
    return new Set<string>();
  }
  const favorites = await favoriteRepository.findFavoriteMoversByCustomerId({
    customerId,
    moverIds,
  });
  return new Set(favorites.map((f) => f.moverId));
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

    const [favorite, ratingDistributionRows] = await Promise.all([
      customerId
        ? favoriteRepository.findFavoriteMover({ customerId, moverId: moverUserId })
        : Promise.resolve(null),
      moverRepository.countRatingDistributionByMoverId(moverUserId),
    ]);

    return {
      ...mapMoverDetail(mover),
      isFavorite: favorite !== null,
      // 리뷰 목록과 분리된 상세 요약(평균·개수와 함께 노출)
      ratingDistribution: mapRatingDistribution(ratingDistributionRows),
    };
  },
};
