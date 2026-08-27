import { z } from "zod";

import { SUPPORTED_TRANSLATION_LOCALES } from "./translation.type";

const MAX_TEXT_COUNT = 20;
const MAX_TEXT_LENGTH = 3_000;
const MAX_TOTAL_LENGTH = 10_000;

export const translateSchema = z
  .object({
    texts: z
      .array(
        z
          .string()
          .trim()
          .min(1, "번역할 텍스트를 입력해 주세요.")
          .max(MAX_TEXT_LENGTH, `텍스트는 각각 ${MAX_TEXT_LENGTH}자 이하여야 합니다.`),
      )
      .min(1, "번역할 텍스트가 1개 이상 필요합니다.")
      .max(MAX_TEXT_COUNT, `한 번에 최대 ${MAX_TEXT_COUNT}개까지 번역할 수 있습니다.`),
    targetLocale: z.enum(SUPPORTED_TRANSLATION_LOCALES),
  })
  .superRefine(({ texts }, ctx) => {
    const totalLength = texts.reduce((sum, text) => sum + text.length, 0);

    if (totalLength > MAX_TOTAL_LENGTH) {
      ctx.addIssue({
        code: "custom",
        path: ["texts"],
        message: `한 번의 요청에서 번역할 수 있는 전체 텍스트는 ${MAX_TOTAL_LENGTH}자 이하여야 합니다.`,
      });
    }
  });

export type TranslateInput = z.infer<typeof translateSchema>;
