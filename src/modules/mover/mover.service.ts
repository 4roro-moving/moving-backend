import { buildPagination } from "../../utils/pagination.util";

import { moverRepository } from "./mover.repository";
import type { ListMoverQuery } from "./mover.type";

export const moverService = {
  async getMoverList(query: ListMoverQuery) {
    const { keyword, sort, serviceArea, moveType, page, limit } = query;

    const { movers, totalCount } = await moverRepository.findMany({
      sort,
      skip: (page - 1) * limit,
      take: limit,
      ...(keyword !== undefined && { keyword }),
      ...(serviceArea !== undefined && { serviceArea }),
      ...(moveType !== undefined && { moveType }),
    });

    return {
      movers: movers.map((mover) => ({
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
      })),
      pagination: buildPagination(totalCount, page, limit),
    };
  },
};
