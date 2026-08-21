import type { Request, Response } from "express";

import { sendResponse } from "../../utils/response.util";

import { noticeService } from "./notice.service";
import type { ListNoticeQuery, NoticeIdParam, NoticeUserRole } from "./notice.type";

function getOptionalNoticeUserRole(req: Request): NoticeUserRole | undefined {
  if (req.user?.role === "CUSTOMER" || req.user?.role === "MOVER") {
    return req.user.role;
  }

  return undefined;
}

export const noticeController = {
  getNoticeList: async (req: Request, res: Response) => {
    const result = await noticeService.getNoticeList(
      getOptionalNoticeUserRole(req),
      res.locals.query as ListNoticeQuery,
    );

    return sendResponse(res, 200, result.notices, {
      pagination: result.pagination,
    });
  },

  getNoticeById: async (req: Request, res: Response) => {
    const { noticeId } = res.locals.params as NoticeIdParam;

    const notice = await noticeService.getNoticeById(getOptionalNoticeUserRole(req), noticeId);

    return sendResponse(res, 200, notice);
  },
};
