export const CHAT_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ChatImageContentType = (typeof CHAT_IMAGE_CONTENT_TYPES)[number];

export interface CreateChatImageUploadUrlInput {
  contentType: ChatImageContentType;
}

export interface ChatImageUploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}
