import type { z } from "zod";

import type {
  bulkDeleteFavoriteMoversSchema,
  favoriteMoverParamSchema,
  listFavoriteMoverQuerySchema,
} from "./favorite.validator";

export type FavoriteMoverParam = z.infer<typeof favoriteMoverParamSchema>;
export type ListFavoriteMoverQuery = z.infer<typeof listFavoriteMoverQuerySchema>;
export type BulkDeleteFavoriteMoversBody = z.infer<typeof bulkDeleteFavoriteMoversSchema>;

export type FavoriteMoverParams = {
  customerId: string;
  moverId: string;
};

export type BulkDeleteFavoriteMoversParams = BulkDeleteFavoriteMoversBody & {
  customerId: string;
};

export type FavoriteMoverCursor = {
  createdAt: Date;
  id: number;
};

// 찜한 기사 목록 DB 조회 시 필요한 파라미터
export type FindFavoriteMoverListParams = {
  customerId: string;
  take: number;
  cursor?: FavoriteMoverCursor;
};

// 찜한 기사 ID 조회 시 필요한 파라미터
export type FindFavoriteMoversByCustomerIdParams = {
  customerId: string;
  moverIds: string[];
};

export type DeleteFavoriteMoversByCustomerIdParams = {
  customerId: string;
  moverIds?: string[];
  excludedIds?: string[];
};
