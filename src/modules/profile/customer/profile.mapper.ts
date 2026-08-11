import { getProfileImageUrl } from "../../../utils/image-url";

import type { profileRepository } from "./profile.repository";
import type { ProfileResponse } from "./profile.type";

type CustomerProfileWithRelations = NonNullable<
  Awaited<ReturnType<typeof profileRepository.findProfileByUserId>>
>;

export const mapProfileResponse = (
  profile: CustomerProfileWithRelations,
  hasPassword: boolean,
): ProfileResponse => {
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.user.name,
    email: profile.user.email,
    phone: profile.user.phone,
    hasPassword,
    imageUrl: getProfileImageUrl(profile.imageUrl),
    regions: profile.serviceAreas.map(({ region }) => ({
      id: region.id,
      name: region.name,
    })),
    serviceTypes: profile.serviceTypes.map(({ moveType }) => moveType),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};
