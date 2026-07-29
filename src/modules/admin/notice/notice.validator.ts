import { z } from "zod";

/**
 * 공지 노출 대상.
 * ALL: 전체 / CUSTOMER: 일반 사용자 / MOVER: 기사님
 */
const audienceSchema = z.enum(["ALL", "CUSTOMER", "MOVER"], {
  error: "노출 대상을 선택해 주세요.",
});

/**
 * 공지 생성 요청 body.
 */
export const createNoticeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "제목을 입력해 주세요.")
    .max(100, "제목은 100자 이하여야 합니다."),
  content: z.string().trim().min(1, "내용을 입력해 주세요."),
  audience: audienceSchema.default("ALL"),
  isPinned: z.boolean().default(false),
  isVisible: z.boolean().default(true),
  // true 이면 audience 에 해당하는 사용자에게 알림을 발송합니다.
  sendNotification: z.boolean().default(false),
});

/**
 * 공지 수정 요청 body. 최소 한 개 필드는 있어야 합니다.
 * 알림 재발송은 지원하지 않으므로 sendNotification 은 수정에서 제외합니다.
 */
export const updateNoticeSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "제목을 입력해 주세요.")
      .max(100, "제목은 100자 이하여야 합니다.")
      .optional(),
    content: z.string().trim().min(1, "내용을 입력해 주세요.").optional(),
    audience: audienceSchema.optional(),
    isPinned: z.boolean().optional(),
    isVisible: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "수정할 내용을 입력해 주세요.",
  });

/**
 * 공지 ID 경로 파라미터.
 */
export const noticeIdParamSchema = z.object({
  noticeId: z.coerce
    .number()
    .int("올바른 공지 ID가 아닙니다.")
    .positive("올바른 공지 ID가 아닙니다."),
});

/**
 * 공지 목록 조회 쿼리.
 * 관리자 목록이므로 숨김(isVisible=false) 공지도 함께 조회할 수 있습니다.
 */
export const listNoticeQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("페이지 번호는 정수여야 합니다.")
    .positive("페이지 번호는 1 이상이어야 합니다.")
    .default(1),
  limit: z.coerce
    .number()
    .int("조회 개수는 정수여야 합니다.")
    .positive("조회 개수는 1 이상이어야 합니다.")
    .max(50, "조회 개수는 50 이하여야 합니다.")
    .default(10),
  audience: audienceSchema.optional(),
  isVisible: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
