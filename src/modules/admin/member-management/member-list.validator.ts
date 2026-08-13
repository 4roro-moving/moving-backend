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

export const memberListSortOrderSchema = z
  .enum(["LATEST", "OLDEST"], {
    error: "정렬 기준은 LATEST 또는 OLDEST여야 합니다.",
  })
  .default("LATEST");

/**
 * 목록 정렬 기준입니다. 반복 query의 전달 순서가 정렬 우선순위가 됩니다.
 * 예: `sorts=CAREER_DESC&sorts=AVERAGE_RATING_DESC`
 */
export const MEMBER_LIST_SORTS = [
  "PENDING_DESC",
  "PENDING_ASC",
  "CREATED_AT_DESC",
  "CREATED_AT_ASC",
] as const;

export function createRepeatedSortsSchema<const T extends readonly [string, ...string[]]>(
  values: T,
) {
  return z
    .preprocess(
      (value) => (typeof value === "string" ? [value] : value),
      z
        .array(z.enum(values, { error: "올바른 정렬 기준이 아닙니다." }))
        .min(1, "정렬 기준은 하나 이상 지정해 주세요.")
        .max(5, "정렬 기준은 최대 5개까지 지정할 수 있습니다.")
        .superRefine((sorts, ctx) => {
          const seenFields = new Set<string>();

          for (const [index, sort] of sorts.entries()) {
            const field = sort.replace(/_(ASC|DESC)$/, "");
            if (seenFields.has(field)) {
              ctx.addIssue({
                code: "custom",
                path: [index],
                message: "같은 정렬 기준은 한 번만 지정할 수 있습니다.",
              });
            }
            seenFields.add(field);
          }
        }),
    )
    .optional();
}

export const memberListSortsSchema = createRepeatedSortsSchema(MEMBER_LIST_SORTS);

/** 미처리 피신고 건수 정렬은 지정할 때만 적용합니다. */
export const memberPendingReportSortSchema = z
  .enum(["PENDING_DESC", "PENDING_ASC"], {
    error: "신고 정렬 기준은 PENDING_DESC 또는 PENDING_ASC여야 합니다.",
  })
  .optional();

export type MemberPendingReportSort = z.infer<typeof memberPendingReportSortSchema>;

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
