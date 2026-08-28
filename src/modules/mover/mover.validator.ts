import { MoveType } from "@prisma/client";
import { z } from "zod";

export const listMoverQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  sort: z.enum(["reviewCount", "rating", "career", "confirmedCount"]).default("reviewCount"),
  serviceArea: z.coerce.number().int().positive().optional(),
  moveType: z.enum(MoveType, { error: "올바른 이사 유형이 아닙니다." }).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export const moverIdParamSchema = z.object({
  moverId: z.uuid("유효하지 않은 기사님 ID입니다."),
});
