import type { z } from "zod";

import type {
  adminListInquiryQuerySchema,
  createInquirySchema,
  createMessageSchema,
  inquiryIdParamSchema,
  listInquiryQuerySchema,
} from "./inquiry.validator";

export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type InquiryIdParam = z.infer<typeof inquiryIdParamSchema>;
export type ListInquiryQuery = z.infer<typeof listInquiryQuerySchema>;
export type AdminListInquiryQuery = z.infer<typeof adminListInquiryQuerySchema>;
