import { AppError } from "../lib/app-error";

export const getProfileImageUrl = (key: string | null): string | null => {
  if (!key) {
    return null;
  }

  if (key.startsWith("http://") || key.startsWith("https://")) {
    return key;
  }

  const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;

  if (!cloudFrontDomain) {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "CLOUDFRONT_DOMAIN 환경변수가 설정되지 않았습니다.",
    });
  }

  const domain = cloudFrontDomain.replace(/\/$/, "");

  const normalizedDomain =
    domain.startsWith("http://") || domain.startsWith("https://") ? domain : `https://${domain}`;

  return `${normalizedDomain}/${key}`;
};
