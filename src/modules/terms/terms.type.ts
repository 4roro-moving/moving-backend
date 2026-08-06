import type { z } from "zod";

import type {
  createTermsSchema,
  listTermsQuerySchema,
  termsIdParamSchema,
  updateTermsSchema,
} from "./terms.validator";

export type CreateTermsInput = z.infer<typeof createTermsSchema>;
export type UpdateTermsInput = z.infer<typeof updateTermsSchema>;
export type TermsIdParam = z.infer<typeof termsIdParamSchema>;
export type ListTermsQuery = z.infer<typeof listTermsQuerySchema>;
