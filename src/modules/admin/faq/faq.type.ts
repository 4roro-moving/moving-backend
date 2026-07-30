import type { z } from "zod";

import type {
  createFaqSchema,
  faqIdParamSchema,
  listFaqQuerySchema,
  updateFaqSchema,
} from "./faq.validator";

export type CreateFaqInput = z.infer<typeof createFaqSchema>;
export type UpdateFaqInput = z.infer<typeof updateFaqSchema>;
export type FaqIdParam = z.infer<typeof faqIdParamSchema>;
export type ListFaqQuery = z.infer<typeof listFaqQuerySchema>;
