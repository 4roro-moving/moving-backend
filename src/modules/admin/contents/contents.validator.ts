import { z } from "zod";

const MAX_PAGE = 10000;
const MAX_REASON_LENGTH = 500;

const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

const dateQuerySchema = z.iso.date("날짜는 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.").optional();

/**
 * 관리자 리뷰 목록 조회 쿼리.
 */
export const listAdminReviewsQuerySchema = z
  .object({
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
    keyword: z.string().trim().min(1).max(100).optional(),
    isHidden: booleanQuerySchema,
    sort: z.enum(["LATEST", "OLDEST", "RATING_HIGH", "RATING_LOW"]).default("LATEST"),
    from: dateQuerySchema,
    to: dateQuerySchema,
    reportedOnly: booleanQuerySchema,
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && data.from > data.to) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "시작일(from)은 종료일(to)보다 늦을 수 없습니다.",
      });
    }
  });

export const reviewIdParamSchema = z.object({
  reviewId: z.coerce
    .number()
    .int("올바른 리뷰 ID가 아닙니다.")
    .positive("올바른 리뷰 ID가 아닙니다."),
});

/** 숨김 처리 body. reason 필수 (DB CHECK 와 동일 정책) */
export const hideContentBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "처리 사유를 입력해 주세요.")
    .max(MAX_REASON_LENGTH, `처리 사유는 ${String(MAX_REASON_LENGTH)}자 이하여야 합니다.`),
});

/** 복구 body. reason 은 선택(권장) */
export const unhideContentBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "처리 사유를 입력해 주세요.")
    .max(MAX_REASON_LENGTH, `처리 사유는 ${String(MAX_REASON_LENGTH)}자 이하여야 합니다.`)
    .optional(),
});
