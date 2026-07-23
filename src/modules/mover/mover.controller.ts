import type { RequestHandler } from "express";

import { sendResponse } from "../../utils/response.util";
import { moverService } from "./mover.service";
import type { ListMoverQuery, MoverIdParam } from "./mover.type";

export const moverController = {
  // GET /api/movers
  getMovers: (async (_req, res, next) => {
    try {
      const query = res.locals.query as ListMoverQuery;

      const result = await moverService.getMoverList(query);

      return sendResponse(res, 200, result.movers, {
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  // GET /api/movers/:moverId
  getMoverDetail: (async (_req, res, next) => {
    try {
      const { moverId: moverUserId } = res.locals.params as MoverIdParam;

      const mover = await moverService.getMoverDetail(moverUserId);

      return sendResponse(res, 200, mover);
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,
};
