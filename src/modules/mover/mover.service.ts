import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";

import { getFavoriteMoverIdSet, isMoverFavoritedByCustomer } from "./mover-favorite.enrichment";
import { mapMoverDetail, mapMoverSummary, mapRatingDistribution } from "./mover.mapper";
import { moverRepository } from "./mover.repository";
import type { ListMoverQuery } from "./mover.type";

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
        ...mapMoverSummary(mover),
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
      ratingDistribution: mapRatingDistribution(ratingDistributionRows),
    };
  },
};
