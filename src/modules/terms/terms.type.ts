import type { UserRole } from "@prisma/client";
import type { z } from "zod";

import type {
  createTermsSchema,
  listTermsQuerySchema,
  saveMyAgreementsSchema,
  termsAgreementsSchema,
  termsIdParamSchema,
  updateTermsSchema,
} from "./terms.validator";

export type CreateTermsInput = z.infer<typeof createTermsSchema>;
export type UpdateTermsInput = z.infer<typeof updateTermsSchema>;
export type TermsIdParam = z.infer<typeof termsIdParamSchema>;
export type ListTermsQuery = z.infer<typeof listTermsQuerySchema>;
export type TermsAgreementsInput = z.infer<typeof termsAgreementsSchema>;
export type TermsAgreementInput = TermsAgreementsInput[number];
export type TermsAudienceRole = Extract<UserRole, "CUSTOMER" | "MOVER">;
export type SaveMyAgreementsInput = z.infer<typeof saveMyAgreementsSchema>;
