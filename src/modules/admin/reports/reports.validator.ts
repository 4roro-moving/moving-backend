import { ReportReason, ReportStatus, ReportTargetType } from "@prisma/client";
import { z } from "zod";

const MAX_PAGE = 10000;
const MAX_HANDLER_NOTE_LENGTH = 500;

export const listAdminReportsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("페이지 번호는 정수여야 합니다.")
    .positive("페이지 번호는 1 이상이어야 합니다.")
    .max(MAX_PAGE, `페이지 번호는 ${String(MAX_PAGE)} 이하여야 합니다.`)
    .default(1),

  limit: z.coerce
    .number()
    .int("조회 개수는 정수여야 합니다.")
    .positive("조회 개수는 1 이상이어야 합니다.")
    .max(50, "조회 개수는 50 이하여야 합니다.")
    .default(10),

  status: z.nativeEnum(ReportStatus).optional(),

  targetType: z.nativeEnum(ReportTargetType).optional(),

  reason: z.nativeEnum(ReportReason).optional(),

  keyword: z.string().trim().min(1).max(100).optional(),

  sort: z.enum(["LATEST", "OLDEST"]).default("LATEST"),
});

export const reportIdParamSchema = z.object({
  reportId: z.coerce
    .number()
    .int("올바른 신고 ID가 아닙니다.")
    .positive("올바른 신고 ID가 아닙니다."),
});

export const handleReportBodySchema = z.object({
  status: z.enum([ReportStatus.RESOLVED, ReportStatus.REJECTED], {
    error: "신고 처리 상태는 RESOLVED 또는 REJECTED여야 합니다.",
  }),

  handlerNote: z
    .string()
    .trim()
    .min(1, "처리 메모를 입력해 주세요.")
    .max(
      MAX_HANDLER_NOTE_LENGTH,
      `처리 메모는 ${String(MAX_HANDLER_NOTE_LENGTH)}자 이하여야 합니다.`,
    ),
});
