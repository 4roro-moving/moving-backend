import type { z } from "zod";

import type {
  confirmReceivedEstimateParamSchema,
  pendingEstimateQuerySchema,
  receivedEstimateDetailParamSchema,
  receivedEstimateIdParamSchema,
  receivedEstimateRequestIdParamSchema,
} from "./customer-estimate.validator";

export type PendingEstimateQuery = z.infer<typeof pendingEstimateQuerySchema>;
export type ReceivedEstimateRequestIdParam = z.infer<typeof receivedEstimateRequestIdParamSchema>;
export type ReceivedEstimateDetailParam = z.infer<typeof receivedEstimateDetailParamSchema>;
export type ConfirmReceivedEstimateParam = z.infer<typeof confirmReceivedEstimateParamSchema>;
export type ReceivedEstimateIdParam = z.infer<typeof receivedEstimateIdParamSchema>;

export type GetReceivedEstimateListParams = {
  estimateRequestId: number;
  customerId: string;
};

export type GetReceivedEstimateDetailParams = GetReceivedEstimateListParams & {
  estimateId: number;
};

export type ConfirmReceivedEstimateParams = GetReceivedEstimateDetailParams;
