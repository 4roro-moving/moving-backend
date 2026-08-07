export const getProfileImageUrl = (key: string | null): string | null => {
  if (!key) {
    return null;
  }

  const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;

  if (!cloudFrontDomain) {
    return null;
  }

  return `${cloudFrontDomain}/${key}`;
};
