import type { Request, Response } from "express";

import { AppError } from "../../../lib/app-error";

import { giveawaysService } from "./giveaways.service";
import type { GiveawayIdParam, HideGiveawayBody, ListAdminGiveawaysQuery } from "./giveaways.type";

function getAdminId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const giveawaysController = {
  // GET /api/admin/giveaways
  getGiveawayList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListAdminGiveawaysQuery;
    const result = await giveawaysService.getGiveawayList(query);

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  },

  // POST /api/admin/giveaways/:giveawayId/hide
  hideGiveaway: async (req: Request, res: Response) => {
    const { giveawayId } = res.locals.params as GiveawayIdParam;
    const input = req.body as HideGiveawayBody;

    const item = await giveawaysService.hideGiveaway({
      adminId: getAdminId(req),
      giveawayId,
      input,
    });

    res.status(200).json({
      success: true,
      message: "나눔글이 숨김 처리되었습니다.",
      data: item,
    });
  },

  // POST /api/admin/giveaways/:giveawayId/unhide
  unhideGiveaway: async (req: Request, res: Response) => {
    const { giveawayId } = res.locals.params as GiveawayIdParam;

    const item = await giveawaysService.unhideGiveaway({
      adminId: getAdminId(req),
      giveawayId,
    });

    res.status(200).json({
      success: true,
      message: "나눔글이 복구되었습니다.",
      data: item,
    });
  },
};
