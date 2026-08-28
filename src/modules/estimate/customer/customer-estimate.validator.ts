import { z } from "zod";

export const pendingEstimateQuerySchema = z.object({
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
});

export const receivedEstimateRequestIdParamSchema = z.object({
  estimateRequestId: z.coerce.number().int().positive(),
});

export const receivedEstimateDetailParamSchema = receivedEstimateRequestIdParamSchema.extend({
  estimateId: z.coerce.number().int().positive(),
});

export const confirmReceivedEstimateParamSchema = receivedEstimateDetailParamSchema;

export const receivedEstimateIdParamSchema = z.object({
  estimateId: z.coerce.number().int().positive(),
});
