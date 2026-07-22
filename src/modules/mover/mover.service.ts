import { buildPagination } from "../../utils/pagination.util";

import { moverRepository } from "./mover.repository";
import type { ListMoverQuery } from "./mover.type";

export const moverService = {
  async getMoverList(query: ListMoverQuery) {
    const { page, limit } = query;

    const { items, totalCount } = await moverRepository.findMany({
      query,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      movers: items,
      pagination: buildPagination(totalCount, page, limit),
    };
  },
};
