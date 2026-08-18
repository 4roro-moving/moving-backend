export const GIVEAWAY_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type GiveawayImageContentType = (typeof GIVEAWAY_IMAGE_CONTENT_TYPES)[number];

export const GIVEAWAY_IMAGE = {
  MAX_COUNT: 5,
  MAX_SIZE: 5 * 1024 * 1024,
  UPLOAD_URL_EXPIRES_IN: 180,
  KEY_PREFIX: "giveaways",
} as const;

export interface CreateGiveawayImageUploadUrlInput {
  contentType: GiveawayImageContentType;
  size: number;
}

export interface GiveawayImageUploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}
