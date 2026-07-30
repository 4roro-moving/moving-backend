import { z } from "zod";

import { PROFILE_IMAGE_CONTENT_TYPES } from "./profile-image.type";

const PROFILE_IMAGE_MAX_SIZE = 2 * 1024 * 1024;

export const createProfileImageUploadUrlSchema = z.strictObject({
  contentType: z.enum(PROFILE_IMAGE_CONTENT_TYPES, {
    error: "지원하지 않는 이미지 형식입니다.",
  }),

  size: z
    .number({
      error: "파일 크기는 숫자여야 합니다.",
    })
    .int({
      error: "파일 크기는 정수여야 합니다.",
    })
    .positive({
      error: "파일 크기는 0보다 커야 합니다.",
    })
    .max(PROFILE_IMAGE_MAX_SIZE, {
      error: "프로필 이미지는 2MB 이하여야 합니다.",
    }),
});

export type CreateProfileImageUploadUrlBody = z.infer<typeof createProfileImageUploadUrlSchema>;
