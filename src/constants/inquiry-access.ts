/** 문의 API에서만 사용하는 인증 접근 유형. */
export const INQUIRY_ACCESS = {
  STANDARD: "STANDARD",
  SUSPENSION_APPEAL: "SUSPENSION_APPEAL",
} as const;

export type InquiryAccess = (typeof INQUIRY_ACCESS)[keyof typeof INQUIRY_ACCESS];
