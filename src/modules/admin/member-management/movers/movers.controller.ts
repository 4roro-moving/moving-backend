import type { Request, Response } from "express";

import { AppError } from "../../../../lib/app-error";
import { sendResponse } from "../../../../utils/response.util";
import { moversService } from "./movers.service";

import type { UpdateMemberStatusBody } from "../member-status.validator";
import type { ListMoverQuery, MoverIdParam } from "./movers.type";

export const moversController = {
  // GET /api/admin/movers
  getMoverList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListMoverQuery;
    const result = await moversService.getMoverList(query);

    return sendResponse(res, 200, result.items, {
      pagination: result.pagination,
    });
  },

  // GET /api/admin/movers/:id
  getMoverDetail: async (_req: Request, res: Response) => {
    const { id } = res.locals.params as MoverIdParam;
    const detail = await moversService.getMoverDetail(id);

    return sendResponse(res, 200, detail);
  },

  // PATCH /api/admin/movers/:id/status
  updateMoverStatus: async (req: Request, res: Response) => {
    const { id } = res.locals.params as MoverIdParam;
    const input = req.body as UpdateMemberStatusBody;

    if (!req.admin) {
      throw new AppError("UNAUTHORIZED");
    }

    const result = await moversService.updateMoverStatus({
      moverId: id,
      adminId: req.admin.id,
      input,
    });

    return sendResponse(res, 200, result);
  },
};
