import { z } from "zod";

export const estimateRequestIdParamSchema = z.object({
  estimateRequestId: z.coerce.number().int().positive(),
});

export type EstimateRequestIdParam = z.infer<typeof estimateRequestIdParamSchema>;
