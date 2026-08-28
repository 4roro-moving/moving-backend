import { z } from "zod";

import { PROFILE_IMAGE_CONTENT_TYPES } from "./profile-image.type";

const PROFILE_IMAGE_MAX_SIZE = 2 * 1024 * 1024;

/**
 * User ID는 RFC 4122 UUID 형식을 따른다.
 *
 * runtime 가입 계정은 UUIDv4, seed/일부 기존 계정은 UUIDv7을 사용할 수 있으므로
 * version nibble은 제한하지 않는다. 실제 소유권은 Service에서 검증한다.
 */
const userIdPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/**
 * 프로필 이미지 ID는 randomUUID()로 생성하므로 UUIDv4를 사용한다.
 */
const imageIdPattern = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/**
 * 프로필 이미지 임시 S3 Key 형식을 검증한다.
 *
 * temp/profiles/{userId}/{imageId}.{extension}
 *
 * - userId: RFC 4122 UUID (version 제한 없음)
 * - imageId: UUIDv4
 *
 * 프로필 생성/수정 요청에서는 Presigned URL 발급 시 생성된
 * 임시 이미지 Key만 전달받는다.
 *
 * 실제 프로필에 저장되는 최종 Key는 Service에서
 * profiles/{userId}/{imageId}.{extension} 형식으로 확정한다.
 */
export const profileImageKeySchema = z
  .string()
  .trim()
  .regex(new RegExp(`^temp/profiles/${userIdPattern}/${imageIdPattern}\\.(jpg|png|webp)$`, "i"), {
    error: "올바른 프로필 이미지 Key 형식이 아닙니다.",
  });

/**
 * 프로필 이미지 Presigned URL 발급 요청을 검증한다.
 *
 * - JPEG / PNG / WebP만 허용
 * - 파일 크기는 0보다 커야 함
 * - 최대 2MB까지 허용
 */
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
