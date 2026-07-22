import { z } from "zod";

export const listMoverQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  sort: z.enum(["reviewCount", "rating", "career", "confirmedCount"]).default("reviewCount"),
  serviceArea: z.coerce.number().int().positive().optional(),
  moveType: z.enum(["SMALL", "HOME", "OFFICE"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});
