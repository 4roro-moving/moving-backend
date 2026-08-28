import type { Pagination } from "../types/response.type";

export function buildPagination(totalCount: number, page: number, limit: number): Pagination {
  const totalPages = Math.ceil(totalCount / limit);

  return {
    page,
    limit,
    totalCount,
    totalPages,
    hasNext: page < totalPages,
  };
}
