import { SuspensionAction } from "@prisma/client";
import { z } from "zod";

import { MEMBER_STATUSES } from "../member-status.constants";

// 깊은 offset 페이지 조회로 인한 DB 부하를 줄이기 위해 최대 1,000페이지로 제한
const MAX_PAGE = 1_000;
const MAX_LIMIT = 100;
const MAX_KEYWORD_LENGTH = 100;
const MAX_STATUS_REASON_LENGTH = 500;
const MAX_STATUS_INTERNAL_NOTE_LENGTH = 1_000;
const DEFAULT_ADMIN_LIST_LIMIT = 20;

const dateQuerySchema = z.iso.date("날짜는 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.").optional();

/**
 * 고객 상태 (DB 컬럼이 아닌 isActive + deletedAt 조합으로 계산).
 */
export const customerStatusSchema = z.enum(MEMBER_STATUSES, {
  error: `회원 상태는 ${MEMBER_STATUSES.join(", ")} 중 하나여야 합니다.`,
});

export const customerIdParamSchema = z.object({
  id: z.uuid("올바른 회원 ID가 아닙니다."),
});

export const updateCustomerStatusBodySchema = z.object({
  action: z.enum(SuspensionAction, {
    error: "처리 동작은 SUSPEND 또는 RELEASE여야 합니다.",
  }),
  reason: z
    .string()
    .trim()
    .min(1, "처리 사유를 입력해 주세요.")
    .max(
      MAX_STATUS_REASON_LENGTH,
      `처리 사유는 ${String(MAX_STATUS_REASON_LENGTH)}자 이하여야 합니다.`,
    ),
  internalNote: z
    .string()
    .trim()
    .max(
      MAX_STATUS_INTERNAL_NOTE_LENGTH,
      `내부 메모는 ${String(MAX_STATUS_INTERNAL_NOTE_LENGTH)}자 이하여야 합니다.`,
    )
    .optional(),
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
      .default(DEFAULT_ADMIN_LIST_LIMIT),
    keyword: z
      .string()
      .trim()
      .min(1, "검색어를 입력해 주세요.")
      .max(MAX_KEYWORD_LENGTH, `검색어는 ${String(MAX_KEYWORD_LENGTH)}자 이하여야 합니다.`)
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
