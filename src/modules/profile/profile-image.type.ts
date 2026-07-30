export const PROFILE_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ProfileImageContentType = (typeof PROFILE_IMAGE_CONTENT_TYPES)[number];

export interface CreateProfileImageUploadUrlInput {
  contentType: ProfileImageContentType;
  size: number;
}

export interface ProfileImageUploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}
