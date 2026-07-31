import type { Request, Response } from "express";

import { AppError } from "../../lib/app-error";
import { sendResponse } from "../../utils/response.util";
import { favoriteService } from "./favorite.service";
import type { FavoriteMoverParam, ListFavoriteMoverQuery } from "./favorite.type";

function getCustomerId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const favoriteController = {
  // GET /api/favorites/movers
  getFavoriteMoverList: async (req: Request, res: Response) => {
    const query = res.locals.query as ListFavoriteMoverQuery;

    const result = await favoriteService.getFavoriteMoverList({
      customerId: getCustomerId(req),
      page: query.page,
      limit: query.limit,
    });

    return sendResponse(res, 200, result.movers, {
      pagination: result.pagination,
    });
  },

  // POST /api/favorites/movers/:moverId
  createFavoriteMover: async (req: Request, res: Response) => {
    const { moverId } = res.locals.params as FavoriteMoverParam;

    const { isNew, ...favoriteMover } = await favoriteService.createFavoriteMover({
      customerId: getCustomerId(req),
      moverId,
    });

    // 생성 여부에 따라 201 Created와 200 OK 구분
    return sendResponse(res, isNew ? 201 : 200, favoriteMover);
  },

  // DELETE /api/favorites/movers/:moverId
  deleteFavoriteMover: async (req: Request, res: Response) => {
    const { moverId } = res.locals.params as FavoriteMoverParam;

    const favoriteMover = await favoriteService.deleteFavoriteMover({
      customerId: getCustomerId(req),
      moverId,
    });

    return sendResponse(res, 200, favoriteMover);
  },
};
