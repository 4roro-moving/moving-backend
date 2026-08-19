import { getProfileImageUrl } from "../../../utils/image-url";

import type { profileRepository } from "./profile.repository";
import type { ProfileResponse } from "./profile.type";

type MoverProfileWithRelations = NonNullable<
  Awaited<ReturnType<typeof profileRepository.findProfileByUserId>>
>;

export const mapProfileResponse = (
  profile: MoverProfileWithRelations,
  hasPassword: boolean,
): ProfileResponse => {
  const activityBase =
    profile.activityBaseAddress !== null &&
    profile.activityBaseZipCode !== null &&
    profile.activityBaseLatitude !== null &&
    profile.activityBaseLongitude !== null
      ? {
          address: profile.activityBaseAddress,
          ...(profile.activityBaseDetailAddress !== null && {
            detailAddress: profile.activityBaseDetailAddress,
          }),
          zipCode: profile.activityBaseZipCode,
          latitude: profile.activityBaseLatitude.toNumber(),
          longitude: profile.activityBaseLongitude.toNumber(),
        }
      : null;

  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.user.name,
    email: profile.user.email,
    phone: profile.user.phone,
    hasPassword,
    nickname: profile.nickname,
    imageUrl: getProfileImageUrl(profile.imageUrl),
    career: profile.career,
    shortIntro: profile.shortIntro,
    description: profile.description,
    activityBase,
    confirmedCount: profile.confirmedCount,
    averageRating: profile.averageRating.toNumber(),
    reviewCount: profile.reviewCount,
    regions: profile.serviceAreas.map(({ region }) => ({
      id: region.id,
      name: region.name,
    })),
    serviceTypes: profile.serviceTypes.map(({ moveType }) => moveType),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};
