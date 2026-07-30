import { z } from "zod";

// 페이지 번호 상한 (과도한 skip 값이 DB 조회로 전달되는 것을 방지)
const MAX_PAGE = 10000;

/**
 * 문의 생성 요청 body.
 * 제목 + 카테고리 + 첫 메시지를 함께 받아 트랜잭션으로 생성한다.
 */
export const createInquirySchema = z.object({
  category: z.enum(["SUSPENSION_APPEAL", "ACCOUNT", "SERVICE", "ETC"], {
    error: "올바른 문의 분류가 아닙니다.",
  }),
  title: z
    .string({ error: "제목은 문자열이어야 합니다." })
    .trim()
    .min(1, "제목을 입력해 주세요.")
    .max(100, "제목은 100자 이하여야 합니다."),
  content: z
    .string({ error: "내용은 문자열이어야 합니다." })
    .trim()
    .min(1, "내용을 입력해 주세요.")
    .max(2000, "내용은 2000자 이하여야 합니다."),
});

/**
 * 메시지 추가 요청 body.
 */
export const createMessageSchema = z.object({
  content: z
    .string({ error: "내용은 문자열이어야 합니다." })
    .trim()
    .min(1, "내용을 입력해 주세요.")
    .max(2000, "내용은 2000자 이하여야 합니다."),
});

/**
 * 문의 ID 경로 파라미터.
 */
export const inquiryIdParamSchema = z.object({
  inquiryId: z.coerce
    .number({ error: "올바른 문의 ID가 아닙니다." })
    .int("올바른 문의 ID가 아닙니다.")
    .positive("올바른 문의 ID가 아닙니다."),
});

/**
 * 사용자 문의 목록 조회 쿼리.
 * status 미전달 시 전체, 전달 시 해당 상태만.
 */
export const listInquiryQuerySchema = z.object({
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
  status: z
    .enum(["OPEN", "ANSWERED", "CLOSED"], { error: "올바른 문의 상태가 아닙니다." })
    .optional(),
});

/**
 * 관리자 문의 목록 조회 쿼리.
 * 미종료(OPEN/ANSWERED)만 보기 등 상태 필터를 지원한다.
 */
export const adminListInquiryQuerySchema = listInquiryQuerySchema.extend({
  openOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
