import type { z } from "zod";

import type {
  adminEstimateIdParamSchema,
  cancelAdminEstimateBodySchema,
} from "./estimates.validator";

export type AdminEstimateIdParam = z.infer<typeof adminEstimateIdParamSchema>;
export type CancelAdminEstimateBody = z.infer<typeof cancelAdminEstimateBodySchema>;

export type CancelAdminEstimateResponse = {
  estimate: {
    id: number;
    status: "CANCELED";
    canceledAt: Date;
  };
  estimateRequest: {
    id: number;
    status: "CANCELED";
    canceledAt: Date;
  };
};
