import type { z } from "zod";

import type {
  createEstimateRequestSchema,
  designateMoverSchema,
  estimateRequestIdParamSchema,
  listEstimateRequestQuerySchema,
  updateEstimateRequestSchema,
} from "./estimateRequest.validator";

export type CreateEstimateRequestInput = z.infer<typeof createEstimateRequestSchema>;
export type UpdateEstimateRequestInput = z.infer<typeof updateEstimateRequestSchema>;
export type EstimateRequestIdParam = z.infer<typeof estimateRequestIdParamSchema>;
export type DesignateMoverInput = z.infer<typeof designateMoverSchema>;
export type ListEstimateRequestQuery = z.infer<typeof listEstimateRequestQuerySchema>;

/**
 * 견적 요청 생성 시 전달되는 출발지 / 도착지 주소
 */
export type AddressInput = CreateEstimateRequestInput["from"];

export type Pagination = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
};
