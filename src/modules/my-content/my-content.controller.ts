import type { Request, Response } from "express";

import { AppError } from "../../lib/app-error";

import { myContentService } from "./my-content.service";
import type { MyContentParams } from "./my-content.type";

function getUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const myContentController = {
  /** GET /api/my-contents/:contentType/:contentId */
  getMyContentDetail: async (req: Request, res: Response) => {
    const { contentType, contentId } = res.locals.params as MyContentParams;

    const data = await myContentService.getMyContentDetail(contentType, contentId, getUserId(req));

    res.status(200).json({ success: true, data });
  },
};
