import { z } from "zod";

export const favoriteMoverParamSchema = z.object({
  moverId: z.uuid("유효하지 않은 기사님 ID입니다."),
});
