import type { Request, Response } from "express";
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
  createNotice: async (req: Request, res: Response) => {
    const notice = await noticeService.createNotice({
      authorId: getAdminId(req),
      input: req.body as CreateNoticeInput,
    });

    res.status(201).json({
      success: true,
      data: notice,
    });
  },

  // GET /api/admin/notices
  getNoticeList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListNoticeQuery;
    const result = await noticeService.getNoticeList(query);

    res.status(200).json({
      success: true,
      data: result.notices,
      pagination: result.pagination,
    });
  },

  // GET /api/admin/notices/:noticeId
  getNoticeById: async (_req: Request, res: Response) => {
    const { noticeId } = res.locals.params as NoticeIdParam;

    const notice = await noticeService.getNoticeById(noticeId);

    res.status(200).json({
      success: true,
      data: notice,
    });
  },

  // PATCH /api/admin/notices/:noticeId
  updateNotice: async (req: Request, res: Response) => {
    const { noticeId } = res.locals.params as NoticeIdParam;

    const notice = await noticeService.updateNotice({
      noticeId,
      input: req.body as UpdateNoticeInput,
    });

    res.status(200).json({
      success: true,
      data: notice,
    });
  },

  // DELETE /api/admin/notices/:noticeId
  deleteNotice: async (_req: Request, res: Response) => {
    const { noticeId } = res.locals.params as NoticeIdParam;

    await noticeService.deleteNotice(noticeId);

    res.status(200).json({
      success: true,
      data: { id: noticeId },
    });
  },
};
