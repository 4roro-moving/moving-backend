import type { Request, RequestHandler } from "express";

import { AppError } from "../../lib/app-error";
import { sendResponse } from "../../utils/response.util";
import { favoriteService } from "./favorite.service";
import type { FavoriteMoverParam } from "./favorite.type";

function getCustomerId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

const createFavoriteMover: RequestHandler = async (req, res, next) => {
  try {
    const { moverId } = res.locals.params as FavoriteMoverParam;

    const favoriteMover = await favoriteService.createFavoriteMover({
      customerId: getCustomerId(req),
      moverId,
    });

    return sendResponse(res, 201, favoriteMover);
  } catch (error) {
    next(error);
  }
};

const deleteFavoriteMover: RequestHandler = async (req, res, next) => {
  try {
    const { moverId } = res.locals.params as FavoriteMoverParam;

    const favoriteMover = await favoriteService.deleteFavoriteMover({
      customerId: getCustomerId(req),
      moverId,
    });

    return sendResponse(res, 200, favoriteMover);
  } catch (error) {
    next(error);
  }
};

export const favoriteController = {
  createFavoriteMover,
  deleteFavoriteMover,
};
