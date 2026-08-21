import { z } from "zod";

const MAX_PAGE = 10000;

export const noticeIdParamSchema = z.object({
  noticeId: z.coerce
    .number()
    .int("올바른 공지 ID가 아닙니다.")
    .positive("올바른 공지 ID가 아닙니다."),
});

export const listNoticeQuerySchema = z.object({
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

  keyword: z
    .string({ error: "검색어는 문자열이어야 합니다." })
    .trim()
    .min(1, "검색어를 입력해 주세요.")
    .max(100, "검색어는 100자 이하여야 합니다.")
    .optional(),
});
