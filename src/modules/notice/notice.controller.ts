import type { Request, Response } from "express";

import { AppError } from "../../lib/app-error";

import { noticeService } from "./notice.service";
import type { ListNoticeQuery, NoticeIdParam, NoticeUserRole } from "./notice.type";

function getNoticeUserRole(req: Request): NoticeUserRole {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  if (req.user.role !== "CUSTOMER" && req.user.role !== "MOVER") {
    throw new AppError("FORBIDDEN");
  }

  return req.user.role;
}

export const noticeController = {
  getNoticeList: async (req: Request, res: Response) => {
    const result = await noticeService.getNoticeList(
      getNoticeUserRole(req),
      res.locals.query as ListNoticeQuery,
    );

    res.status(200).json({
      success: true,
      data: result.notices,
      pagination: result.pagination,
    });
  },

  getNoticeById: async (req: Request, res: Response) => {
    const { noticeId } = res.locals.params as NoticeIdParam;

    const notice = await noticeService.getNoticeById(getNoticeUserRole(req), noticeId);

    res.status(200).json({
      success: true,
      data: notice,
    });
  },
};
