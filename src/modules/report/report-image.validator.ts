import { z } from "zod";

import { REPORT_IMAGE, REPORT_IMAGE_CONTENT_TYPES } from "./report-image.type";

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export const reportImageKeySchema = z
  .string({ error: "이미지 Key는 문자열이어야 합니다." })
  .trim()
  .regex(
    new RegExp(
      `^${REPORT_IMAGE.TEMP_KEY_PREFIX}/${uuidPattern}/${uuidPattern}\\.(jpg|png|webp)$`,
      "i",
    ),
    {
      error: "올바른 신고 이미지 Key 형식이 아닙니다.",
    },
  );

export const reportImageKeysSchema = z
  .array(reportImageKeySchema)
  .max(
    REPORT_IMAGE.MAX_COUNT,
    `이미지는 최대 ${String(REPORT_IMAGE.MAX_COUNT)}장까지 등록할 수 있습니다.`,
  )
  .refine((imageKeys) => new Set(imageKeys).size === imageKeys.length, {
    message: "이미지 Key는 중복될 수 없습니다.",
  });

export const createReportImageUploadUrlSchema = z.strictObject({
  contentType: z.enum(REPORT_IMAGE_CONTENT_TYPES, {
    error: "지원하지 않는 이미지 형식입니다.",
  }),
});
