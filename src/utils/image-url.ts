export const getProfileImageUrl = (key: string | null): string | null => {
  if (!key) {
    return null;
  }

  const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;

  /*
   * CloudFront가 아직 설정되지 않은 개발 환경에서는
   * 기존 S3 Key를 그대로 반환한다.
   */
  if (!cloudFrontDomain) {
    return key;
  }

  const normalizedDomain = cloudFrontDomain.replace(/\/$/, "");

  return `${normalizedDomain}/${key}`;
};
