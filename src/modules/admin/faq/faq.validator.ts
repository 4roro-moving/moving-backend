import { z } from "zod";

// 페이지 번호 상한 (과도한 skip 값이 DB 조회로 전달되는 것을 방지)
const MAX_PAGE = 10000;

/**
 * FAQ 생성 요청 body.
 */
export const createFaqSchema = z.object({
  question: z
    .string({ error: "질문은 문자열이어야 합니다." })
    .trim()
    .min(1, "질문을 입력해 주세요.")
    .max(200, "질문은 200자 이하여야 합니다."),
  answer: z.string({ error: "답변은 문자열이어야 합니다." }).trim().min(1, "답변을 입력해 주세요."),
  sortOrder: z
    .number({ error: "정렬 순서는 숫자여야 합니다." })
    .int("정렬 순서는 정수여야 합니다.")
    .min(0, "정렬 순서는 0 이상이어야 합니다.")
    .default(0),
  isVisible: z.boolean().default(true),
});

/**
 * FAQ 수정 요청 body. 최소 한 개 필드는 있어야 합니다.
 */
export const updateFaqSchema = z
  .object({
    question: z
      .string({ error: "질문은 문자열이어야 합니다." })
      .trim()
      .min(1, "질문을 입력해 주세요.")
      .max(200, "질문은 200자 이하여야 합니다.")
      .optional(),
    answer: z
      .string({ error: "답변은 문자열이어야 합니다." })
      .trim()
      .min(1, "답변을 입력해 주세요.")
      .optional(),
    sortOrder: z
      .number({ error: "정렬 순서는 숫자여야 합니다." })
      .int("정렬 순서는 정수여야 합니다.")
      .min(0, "정렬 순서는 0 이상이어야 합니다.")
      .optional(),
    isVisible: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "수정할 내용을 입력해 주세요.",
  });

/**
 * FAQ ID 경로 파라미터.
 */
export const faqIdParamSchema = z.object({
  faqId: z.coerce
    .number({ error: "올바른 FAQ ID가 아닙니다." })
    .int("올바른 FAQ ID가 아닙니다.")
    .positive("올바른 FAQ ID가 아닙니다."),
});

/**
 * 관리자 FAQ 목록 조회 쿼리.
 * 관리자이므로 숨김(isVisible=false) FAQ도 함께 조회할 수 있습니다.
 */
export const listFaqQuerySchema = z.object({
  page: z.coerce
    .number({ error: "페이지 번호는 숫자여야 합니다." })
    .int("페이지 번호는 정수여야 합니다.")
    .positive("페이지 번호는 1 이상이어야 합니다.")
    .max(MAX_PAGE, `페이지 번호는 ${String(MAX_PAGE)} 이하여야 합니다.`)
    .default(1),

  limit: z.coerce
    .number({ error: "조회 개수는 숫자여야 합니다." })
    .int("조회 개수는 정수여야 합니다.")
    .positive("조회 개수는 1 이상이어야 합니다.")
    .max(50, "조회 개수는 50 이하여야 합니다.")
    .default(10),

  keyword: z
    .string({ error: "검색어는 문자열이어야 합니다." })
    .trim()
    .min(1, "검색어를 입력해 주세요.")
    .max(100, "검색어는 100자 이하여야 합니다.")
    .optional(),

  isVisible: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
