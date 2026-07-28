import type { z } from "zod";

import type {
  createNoticeSchema,
  listNoticeQuerySchema,
  noticeIdParamSchema,
  updateNoticeSchema,
} from "./notice.validator";

export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>;
export type NoticeIdParam = z.infer<typeof noticeIdParamSchema>;
export type ListNoticeQuery = z.infer<typeof listNoticeQuerySchema>;
