export const REPORT_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ReportImageContentType = (typeof REPORT_IMAGE_CONTENT_TYPES)[number];

export const REPORT_IMAGE = {
  KEY_PREFIX: "reports",
  MAX_COUNT: 5,
  MAX_SIZE: 5 * 1024 * 1024,
  UPLOAD_URL_EXPIRES_IN: 180,
} as const;

export interface CreateReportImageUploadUrlInput {
  contentType: ReportImageContentType;
}

export interface ReportImageUploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export interface ReportImageItem {
  id: number;
  imageUrl: string;
}
