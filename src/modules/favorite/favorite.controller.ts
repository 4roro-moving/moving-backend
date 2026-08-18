import type { Request, Response } from "express";

import { getAuthenticatedUserId } from "../../utils/request-auth.util";
import { sendResponse } from "../../utils/response.util";
import { favoriteService } from "./favorite.service";
import type {
  BulkDeleteFavoriteMoversBody,
  FavoriteMoverParam,
  ListFavoriteMoverQuery,
} from "./favorite.type";

export const favoriteController = {
  // GET /api/favorites/movers
  getFavoriteMoverList: async (req: Request, res: Response) => {
    const query = res.locals.query as ListFavoriteMoverQuery;

    const result = await favoriteService.getFavoriteMoverList({
      customerId: getAuthenticatedUserId(req),
      cursor: query.cursor,
      limit: query.limit,
    });

    return sendResponse(res, 200, result.movers, {
      pagination: result.pagination,
    });
  },

  // DELETE /api/favorites/movers
  deleteFavoriteMovers: async (req: Request, res: Response) => {
    const body = req.body as BulkDeleteFavoriteMoversBody;

    const result = await favoriteService.deleteFavoriteMovers({
      customerId: getAuthenticatedUserId(req),
      moverIds: body.moverIds,
      all: body.all,
      excludedIds: body.excludedIds,
    });

    return sendResponse(res, 200, result);
  },

  // POST /api/favorites/movers/:moverId
  createFavoriteMover: async (req: Request, res: Response) => {
    const { moverId } = res.locals.params as FavoriteMoverParam;

    const { isNew, ...favoriteMover } = await favoriteService.createFavoriteMover({
      customerId: getAuthenticatedUserId(req),
      moverId,
    });

    // 생성 여부에 따라 201 Created와 200 OK 구분
    return sendResponse(res, isNew ? 201 : 200, favoriteMover);
  },

  // DELETE /api/favorites/movers/:moverId
  deleteFavoriteMover: async (req: Request, res: Response) => {
    const { moverId } = res.locals.params as FavoriteMoverParam;

    const favoriteMover = await favoriteService.deleteFavoriteMover({
      customerId: getAuthenticatedUserId(req),
      moverId,
    });

    return sendResponse(res, 200, favoriteMover);
  },
};
