import { z } from "zod";

const MAX_PAGE = 10000;
const MAX_LIMIT = 100;

const dateQuerySchema = z.iso.date("날짜는 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.").optional();

/**
 * 고객 상태 (DB 컬럼이 아닌 isActive + deletedAt 조합으로 계산).
 */
export const customerStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "WITHDRAWN"], {
  error: "회원 상태는 ACTIVE, SUSPENDED, WITHDRAWN 중 하나여야 합니다.",
});

/**
 * 고객 상세 조회 경로 파라미터.
 */
export const customerIdParamSchema = z.object({
  id: z.uuid("올바른 회원 ID가 아닙니다."),
});

/**
 * 관리자 고객 목록 조회 쿼리.
 * status 미지정 시 ACTIVE + SUSPENDED 만 조회 (WITHDRAWN 제외).
 */
export const listCustomerQuerySchema = z
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
      .max(MAX_LIMIT, `조회 개수는 ${String(MAX_LIMIT)} 이하여야 합니다.`)
      .default(20),
    keyword: z
      .string()
      .trim()
      .min(1, "검색어를 입력해 주세요.")
      .max(100, "검색어는 100자 이하여야 합니다.")
      .optional(),
    status: customerStatusSchema.optional(),
    fromDate: dateQuerySchema,
    toDate: dateQuerySchema,
  })
  .superRefine((data, ctx) => {
    if (data.fromDate && data.toDate && data.fromDate > data.toDate) {
      ctx.addIssue({
        code: "custom",
        path: ["fromDate"],
        message: "시작일(fromDate)은 종료일(toDate)보다 늦을 수 없습니다.",
      });
    }
  });
