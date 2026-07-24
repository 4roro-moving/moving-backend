import type { z } from "zod";

import type { favoriteMoverParamSchema, listFavoriteMoverQuerySchema } from "./favorite.validator";

export type FavoriteMoverParam = z.infer<typeof favoriteMoverParamSchema>;
export type ListFavoriteMoverQuery = z.infer<typeof listFavoriteMoverQuerySchema>;

export type FavoriteMoverParams = {
  customerId: string;
  moverId: string;
};

// 찜한 기사 목록 DB 조회 시 필요한 파라미터
export type FindFavoriteMoverListParams = {
  customerId: string;
  skip: number;
  take: number;
};
