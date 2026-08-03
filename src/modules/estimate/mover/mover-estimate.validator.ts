import { z } from "zod";

function parseBoolean(value: unknown) {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function makeArray(value: unknown) {
  if (value == null || Array.isArray(value)) return value;
  return [value];
}

const booleanSchema = z.preprocess(parseBoolean, z.boolean());
const moveTypeSchema = z.preprocess(
  makeArray,
  z
    .array(z.enum(["SMALL", "HOME", "OFFICE"]))
    .min(1)
    .max(3),
);

export const moverEstimateRequestListQuerySchema = z.object({
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
  keyword: z.string().trim().min(1).max(50).optional(),
  moveType: moveTypeSchema.optional(),
  isDesignated: booleanSchema.optional(),
  isServiceArea: booleanSchema.optional(),
  sort: z.enum(["moveDate", "requestedAt"]).default("requestedAt"),
});

export const moverEstimateRejectionListQuerySchema = z.object({
  cursor: z
    .string()
    .regex(/^[1-9]\d*$/, "커서는 1 이상의 정수여야 합니다.")
    .optional(),
  limit: z.coerce
    .number("조회 개수는 숫자여야 합니다.")
    .int("조회 개수는 정수여야 합니다.")
    .positive("조회 개수는 1 이상이어야 합니다.")
    .max(50, "조회 개수는 최대 50개까지 가능합니다.")
    .default(10),
});

export const moverSentEstimateListQuerySchema = z.object({
  page: z.coerce
    .number("페이지는 숫자여야 합니다.")
    .int("페이지는 정수여야 합니다.")
    .positive("페이지는 1 이상이어야 합니다.")
    .max(1000, "페이지는 최대 1000까지 조회할 수 있습니다.")
    .default(1),
  limit: z.coerce
    .number("조회 개수는 숫자여야 합니다.")
    .int("조회 개수는 정수여야 합니다.")
    .positive("조회 개수는 1 이상이어야 합니다.")
    .max(50, "조회 개수는 최대 50개까지 가능합니다.")
    .default(10),
  status: z
    .enum(["SENT", "CONFIRMED", "COMPLETED"], {
      error: "상태는 SENT, CONFIRMED, COMPLETED 중 하나여야 합니다.",
    })
    .optional(),
});

export const sendEstimateParamSchema = z.object({
  estimateRequestId: z.coerce.number().int().positive("올바른 견적 요청 ID가 아닙니다."),
});

export const sendEstimateBodySchema = z.object({
  price: z
    .number()
    .int("견적가는 정수로 입력해 주세요.")
    .positive("견적가는 0원보다 커야 합니다.")
    .max(100_000_000, "견적가는 1억 원 이하로 입력해 주세요."),
  comment: z
    .string()
    .trim()
    .min(10, "코멘트는 최소 10자 이상 입력해 주세요.")
    .max(1000, "코멘트는 최대 1000자까지 입력할 수 있습니다."),
});

export const rejectEstimateBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "반려 사유는 최소 10자 이상 입력해 주세요.")
    .max(1000, "반려 사유는 최대 1000자까지 입력할 수 있습니다."),
});

export const moverSentEstimateIdParamSchema = z.object({
  estimateId: z.coerce.number().int().positive(),
});
