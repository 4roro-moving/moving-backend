import { z } from "zod";

import { GIVEAWAY_IMAGE, GIVEAWAY_IMAGE_CONTENT_TYPES } from "./giveaway-image.type";

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/*
 * 나눔 이미지 S3 Key 형식을 검증한다.
 *
 * giveaways/{userId}/{imageId}.{extension}
 */
export const giveawayImageKeySchema = z
  .string({ error: "이미지 Key는 문자열이어야 합니다." })
  .trim()
  .regex(
    new RegExp(
      `^${GIVEAWAY_IMAGE.KEY_PREFIX}/${uuidPattern}/${uuidPattern}\\.(jpg|png|webp)$`,
      "i",
    ),
    {
      error: "올바른 나눔 이미지 Key 형식이 아닙니다.",
    },
  );

export const giveawayImageKeysSchema = z
  .array(giveawayImageKeySchema)
  .max(
    GIVEAWAY_IMAGE.MAX_COUNT,
    `이미지는 최대 ${String(GIVEAWAY_IMAGE.MAX_COUNT)}장까지 등록할 수 있습니다.`,
  )
  .refine((imageKeys) => new Set(imageKeys).size === imageKeys.length, {
    message: "이미지 Key는 중복될 수 없습니다.",
  });

export const createGiveawayImageUploadUrlSchema = z.strictObject({
  contentType: z.enum(GIVEAWAY_IMAGE_CONTENT_TYPES, {
    error: "지원하지 않는 이미지 형식입니다.",
  }),
  size: z
    .number({ error: "파일 크기는 숫자여야 합니다." })
    .int({ error: "파일 크기는 정수여야 합니다." })
    .positive({ error: "파일 크기는 0보다 커야 합니다." })
    .max(GIVEAWAY_IMAGE.MAX_SIZE, {
      error: `나눔 이미지는 ${String(GIVEAWAY_IMAGE.MAX_SIZE / (1024 * 1024))}MB 이하여야 합니다.`,
    }),
});

export type CreateGiveawayImageUploadUrlBody = z.infer<typeof createGiveawayImageUploadUrlSchema>;
