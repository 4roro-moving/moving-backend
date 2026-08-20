import { z } from "zod";

import { ADMIN_RESIDENCE_REVIEW_SORTS } from "./residence-reviews.constants";

const MAX_PAGE = 10000;
const MAX_REASON_LENGTH = 500;
/** 리뷰 관리와 동일: 공백 제외 최소 글자 수 */
const HIDE_REASON_MIN_NON_SPACE = 10;

const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

/**
 * 관리자 거주후기 목록 조회 쿼리.
 */
export const listAdminResidenceReviewsQuerySchema = z.object({
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
  sort: z
    .enum(ADMIN_RESIDENCE_REVIEW_SORTS, {
      error: "정렬 기준이 올바르지 않습니다.",
    })
    .default("LATEST"),
});

export const residenceReviewIdParamSchema = z.object({
  residenceReviewId: z.coerce
    .number()
    .int("올바른 거주후기 ID가 아닙니다.")
    .positive("올바른 거주후기 ID가 아닙니다."),
});

function countNonSpaceChars(value: string): number {
  return value.replace(/\s/g, "").length;
}

/** 숨김 처리 body. reason 필수 — 공백 제외 최소 10자 */
export const hideResidenceReviewBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "처리 사유를 입력해 주세요.")
    .max(MAX_REASON_LENGTH, `처리 사유는 ${String(MAX_REASON_LENGTH)}자 이하여야 합니다.`)
    .superRefine((value, ctx) => {
      if (countNonSpaceChars(value) < HIDE_REASON_MIN_NON_SPACE) {
        ctx.addIssue({
          code: "custom",
          message: `처리 사유는 공백 제외 ${String(HIDE_REASON_MIN_NON_SPACE)}자 이상이어야 합니다.`,
        });
      }
    }),
});

/** 복구 body. 사유 없음 — 빈 객체만 허용 */
export const unhideResidenceReviewBodySchema = z.object({});
