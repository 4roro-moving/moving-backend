import { z } from "zod";

import { MEMBER_STATUSES } from "./member-status.constants";

// 깊은 offset 페이지 조회로 인한 DB 부하를 줄이기 위해 최대 1,000페이지로 제한
const MAX_PAGE = 1_000;

const MAX_LIMIT = 100;
const MAX_KEYWORD_LENGTH = 100;
const DEFAULT_ADMIN_LIST_LIMIT = 20;

export const memberListPageSchema = z.coerce
  .number()
  .int("페이지 번호는 정수여야 합니다.")
  .positive("페이지 번호는 1 이상이어야 합니다.")
  .max(MAX_PAGE, `페이지 번호는 ${String(MAX_PAGE)} 이하여야 합니다.`)
  .default(1);

export const memberListLimitSchema = z.coerce
  .number()
  .int("조회 개수는 정수여야 합니다.")
  .positive("조회 개수는 1 이상이어야 합니다.")
  .max(MAX_LIMIT, `조회 개수는 ${String(MAX_LIMIT)} 이하여야 합니다.`)
  .default(DEFAULT_ADMIN_LIST_LIMIT);

export const memberListKeywordSchema = z
  .string()
  .trim()
  .min(1, "검색어를 입력해 주세요.")
  .max(MAX_KEYWORD_LENGTH, `검색어는 ${String(MAX_KEYWORD_LENGTH)}자 이하여야 합니다.`)
  .optional();

/** 프로필 완료 여부 query를 boolean으로 변환합니다. */
export const memberProfileCompletedSchema = z
  .enum(["true", "false"], { error: "프로필 완료 여부는 true 또는 false여야 합니다." })
  .transform((value) => value === "true")
  .optional();

export const memberStatusSchema = z.enum(MEMBER_STATUSES, {
  error: `회원 상태는 ${MEMBER_STATUSES.join(", ")} 중 하나여야 합니다.`,
});

export const memberListDateQuerySchema = z.iso
  .date("날짜는 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.")
  .optional();

export function validateMemberListDateRange(
  data: { fromDate?: string | undefined; toDate?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (data.fromDate && data.toDate && data.fromDate > data.toDate) {
    ctx.addIssue({
      code: "custom",
      path: ["fromDate"],
      message: "시작일(fromDate)은 종료일(toDate)보다 늦을 수 없습니다.",
    });
  }
}
