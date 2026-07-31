import { z } from "zod";

export const favoriteMoverParamSchema = z.object({
  moverId: z.uuid("유효하지 않은 기사님 ID입니다."),
});

export const listFavoriteMoverQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

const moverIdArraySchema = z
  .array(z.uuid("유효하지 않은 기사님 ID입니다."))
  .max(100, "한 번에 최대 100명까지 해제할 수 있습니다.");

/** DELETE /favorites/movers — moverIds 또는 all(+excludedIds) */
export const bulkDeleteFavoriteMoversSchema = z
  .object({
    moverIds: moverIdArraySchema.optional(),
    all: z.boolean().optional(),
    excludedIds: moverIdArraySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.all === true) {
      return;
    }

    if (!value.moverIds || value.moverIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["moverIds"],
        message: "moverIds를 보내거나 all: true로 전체 해제를 요청해주세요.",
      });
    }
  });
