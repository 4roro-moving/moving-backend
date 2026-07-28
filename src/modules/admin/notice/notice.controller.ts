import type { Request, RequestHandler } from "express";

import { AppError } from "../../../lib/app-error";
import { noticeService } from "./notice.service";
import type {
  CreateNoticeInput,
  ListNoticeQuery,
  NoticeIdParam,
  UpdateNoticeInput,
} from "./notice.type";

function getAdminId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const noticeController = {
  // POST /api/admin/notices
  createNotice: (async (req, res, next) => {
    try {
      const notice = await noticeService.createNotice({
        authorId: getAdminId(req),
        input: req.body as CreateNoticeInput,
      });

      res.status(201).json({
        success: true,
        data: notice,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  // GET /api/admin/notices
  getNoticeList: (async (_req, res, next) => {
    try {
      const query = res.locals.query as ListNoticeQuery;

      const result = await noticeService.getNoticeList(query);

      res.status(200).json({
        success: true,
        data: result.notices,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  // GET /api/admin/notices/:noticeId
  getNoticeById: (async (_req, res, next) => {
    try {
      const { noticeId } = res.locals.params as NoticeIdParam;

      const notice = await noticeService.getNoticeById(noticeId);

      res.status(200).json({
        success: true,
        data: notice,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  // PATCH /api/admin/notices/:noticeId
  updateNotice: (async (req, res, next) => {
    try {
      const { noticeId } = res.locals.params as NoticeIdParam;

      const notice = await noticeService.updateNotice({
        noticeId,
        input: req.body as UpdateNoticeInput,
      });

      res.status(200).json({
        success: true,
        data: notice,
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,

  // DELETE /api/admin/notices/:noticeId
  deleteNotice: (async (_req, res, next) => {
    try {
      const { noticeId } = res.locals.params as NoticeIdParam;

      await noticeService.deleteNotice(noticeId);

      res.status(200).json({
        success: true,
        data: { id: noticeId },
      });
    } catch (error) {
      next(error);
    }
  }) satisfies RequestHandler,
};
