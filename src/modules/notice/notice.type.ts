import type { UserRole } from "@prisma/client";
import type { z } from "zod";

import type { listNoticeQuerySchema, noticeIdParamSchema } from "./notice.validator";

export type NoticeIdParam = z.infer<typeof noticeIdParamSchema>;
export type ListNoticeQuery = z.infer<typeof listNoticeQuerySchema>;

export type NoticeUserRole = Extract<UserRole, "CUSTOMER" | "MOVER">;
