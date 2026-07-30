import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";

import { getFavoriteMoverIdSet, isMoverFavoritedByCustomer } from "./mover-favorite.enrichment";
import { mapMoverBase } from "./mover.shared";
import { moverRepository } from "./mover.repository";
import type { ListMoverQuery } from "./mover.type";

// 상세 조회 repository 결과에서 null을 제외한 기사 타입
type MoverDetail = NonNullable<Awaited<ReturnType<typeof moverRepository.findByMoverUserId>>>;

type RatingDistributionRow = Awaited<
  ReturnType<typeof moverRepository.countRatingDistributionByMoverId>
>[number];

// 없는 점수도 0으로 채우기 위해 5→1 고정
const RATING_SCORES = [5, 4, 3, 2, 1] as const;

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

    const [isFavorite, ratingDistributionRows] = await Promise.all([
      isMoverFavoritedByCustomer(customerId, moverUserId),
      moverRepository.countRatingDistributionByMoverId(moverUserId),
    ]);

    return {
      ...mapMoverDetail(mover),
      isFavorite,
      // 리뷰 목록과 분리된 상세 요약(평균·개수와 함께 노출)
      ratingDistribution: mapRatingDistribution(ratingDistributionRows),
    };
  },
};
