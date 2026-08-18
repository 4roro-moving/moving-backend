export const CHAT_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const CHAT_IMAGE_MAX_SIZE = 25 * 1024 * 1024;

export type ChatImageContentType = (typeof CHAT_IMAGE_CONTENT_TYPES)[number];

export interface CreateChatImageUploadUrlInput {
  contentType: ChatImageContentType;
  size: number;
}

export interface ChatImageUploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}
