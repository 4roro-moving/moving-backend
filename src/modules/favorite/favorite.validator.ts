import { z } from "zod";

export const favoriteMoverParamSchema = z.object({
  moverId: z.uuid("유효하지 않은 기사님 ID입니다."),
});

export const listFavoriteMoverQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});
