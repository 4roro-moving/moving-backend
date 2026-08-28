import { z } from "zod";

export const MY_CONTENT_TYPES = ["review", "residence-review", "giveaway"] as const;

export const myContentParamsSchema = z.object({
  contentType: z.enum(MY_CONTENT_TYPES, {
    error: "콘텐츠 유형이 올바르지 않습니다.",
  }),
  contentId: z.coerce
    .number()
    .int("올바른 콘텐츠 ID가 아닙니다.")
    .positive("올바른 콘텐츠 ID가 아닙니다."),
});
