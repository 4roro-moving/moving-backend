import { randomUUID } from "node:crypto";

import type {
  CreateProfileImageUploadUrlInput,
  ProfileImageUploadUrlResponse,
} from "./profile-image.type";

const PROFILE_IMAGE_UPLOAD_URL_EXPIRES_IN = 180;

const getExtension = (contentType: CreateProfileImageUploadUrlInput["contentType"]) => {
  const extensionMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  } as const;

  return extensionMap[contentType];
};

const createUploadUrl = async (
  userId: string,
  input: CreateProfileImageUploadUrlInput,
): Promise<ProfileImageUploadUrlResponse> => {
  const extension = getExtension(input.contentType);
  const key = `profiles/${userId}/${randomUUID()}.${extension}`;

  /*
   * TODO:
   * S3 환경이 준비되면 PutObjectCommand와 getSignedUrl을 사용하여
   * 실제 Presigned URL을 생성한다.
   */
  const uploadUrl = `https://example.com/upload/${key}`;

  return {
    uploadUrl,
    key,
    expiresIn: PROFILE_IMAGE_UPLOAD_URL_EXPIRES_IN,
  };
};

export const profileImageService = {
  createUploadUrl,
};
