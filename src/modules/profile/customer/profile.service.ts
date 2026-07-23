import bcrypt from "bcrypt";
import { Prisma, UserRole } from "@prisma/client";

import { runTransaction } from "../../../utils/transaction";
import { AppError } from "../../../lib/app-error";

import { profileRepository } from "./profile.repository";
import type { CreateProfileInput, ProfileResponse, UpdateProfileInput } from "./profile.type";

type UserWithPassword = NonNullable<Awaited<ReturnType<typeof profileRepository.findUserById>>>;

type CustomerProfileWithRelations = NonNullable<
  Awaited<ReturnType<typeof profileRepository.findProfileByUserId>>
>;

const PASSWORD_SALT_ROUNDS = 10;

const isUniqueConstraintError = (error: unknown): error is Prisma.PrismaClientKnownRequestError => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
};

const validateActiveCustomer = (user: UserWithPassword | null): UserWithPassword => {
  if (!user) {
    throw new AppError("NOT_FOUND", {
      message: "사용자를 찾을 수 없습니다.",
    });
  }

  if (!user.isActive || user.deletedAt !== null) {
    throw new AppError("FORBIDDEN", {
      message: "비활성화된 사용자입니다.",
    });
  }

  if (user.role !== UserRole.CUSTOMER) {
    throw new AppError("FORBIDDEN", {
      message: "일반 사용자만 이용할 수 있습니다.",
    });
  }

  return user;
};

const validateRegions = async (regionIds: number[]): Promise<void> => {
  const regionCount = await profileRepository.countRegionsByIds(regionIds);

  if (regionCount !== regionIds.length) {
    throw new AppError("BAD_REQUEST", {
      message: "존재하지 않는 지역이 포함되어 있습니다.",
    });
  }
};

const mapProfileResponse = (profile: CustomerProfileWithRelations): ProfileResponse => {
  return {
    id: profile.id,
    userId: profile.userId,

    name: profile.user.name,
    email: profile.user.email,
    phone: profile.user.phone,

    imageUrl: profile.imageUrl,

    regions: profile.serviceAreas.map(({ region }) => ({
      id: region.id,
      name: region.name,
    })),

    serviceTypes: profile.serviceTypes.map(({ moveType }) => moveType),

    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};

const createProfile = async (
  userId: string,
  input: CreateProfileInput,
): Promise<ProfileResponse> => {
  const user = validateActiveCustomer(await profileRepository.findUserById(userId));

  const existingProfile = await profileRepository.findProfileByUserId(user.id);

  if (existingProfile) {
    throw new AppError("CONFLICT", {
      message: "이미 등록된 프로필이 있습니다.",
    });
  }

  await validateRegions(input.regionIds);

  try {
    const profile = await runTransaction(async (tx) => {
      const createdProfile = await profileRepository.createProfile(user.id, input, tx);

      await profileRepository.markProfileCompleted(user.id, tx);

      return createdProfile;
    });

    return mapProfileResponse(profile);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError("CONFLICT", {
        message: "이미 등록된 프로필 정보입니다.",
      });
    }

    throw error;
  }
};

const getMyProfile = async (userId: string): Promise<ProfileResponse> => {
  const user = validateActiveCustomer(await profileRepository.findUserById(userId));

  const profile = await profileRepository.findProfileByUserId(user.id);

  if (!profile) {
    throw new AppError("NOT_FOUND", {
      message: "등록된 프로필이 없습니다.",
    });
  }

  return mapProfileResponse(profile);
};

const getProfileStatus = async (
  userId: string,
): Promise<{
  isProfileCompleted: boolean;
}> => {
  const user = validateActiveCustomer(await profileRepository.findUserById(userId));

  return {
    isProfileCompleted: user.isProfileCompleted,
  };
};

const updateProfile = async (
  userId: string,
  input: UpdateProfileInput,
): Promise<ProfileResponse> => {
  const user = validateActiveCustomer(await profileRepository.findUserById(userId));

  const existingProfile = await profileRepository.findProfileByUserId(user.id);

  if (!existingProfile) {
    throw new AppError("NOT_FOUND", {
      message: "등록된 프로필이 없습니다.",
    });
  }

  if (input.phone !== undefined && input.phone !== user.phone) {
    const phoneOwner = await profileRepository.findUserByPhoneExcludingUser(input.phone, user.id);

    if (phoneOwner) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
      });
    }
  }

  if (input.regionIds !== undefined) {
    await validateRegions(input.regionIds);
  }

  let hashedPassword: string | undefined;

  const isPasswordChangeRequested =
    input.currentPassword !== undefined ||
    input.newPassword !== undefined ||
    input.newPasswordConfirm !== undefined;

  if (isPasswordChangeRequested) {
    if (
      input.currentPassword === undefined ||
      input.newPassword === undefined ||
      input.newPasswordConfirm === undefined
    ) {
      throw new AppError("BAD_REQUEST", {
        message: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요.",
      });
    }

    if (!user.password) {
      throw new AppError("BAD_REQUEST", {
        message: "소셜 로그인 계정은 비밀번호를 변경할 수 없습니다.",
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(input.currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      throw new AppError("UNAUTHORIZED", {
        message: "현재 비밀번호가 일치하지 않습니다.",
      });
    }

    if (input.newPassword !== input.newPasswordConfirm) {
      throw new AppError("BAD_REQUEST", {
        message: "새 비밀번호가 일치하지 않습니다.",
      });
    }

    hashedPassword = await bcrypt.hash(input.newPassword, PASSWORD_SALT_ROUNDS);
  }

  try {
    return await runTransaction(async (tx) => {
      const hasUserUpdate =
        input.name !== undefined || input.phone !== undefined || hashedPassword !== undefined;

      if (hasUserUpdate) {
        await profileRepository.updateUser(
          user.id,
          {
            ...(input.name !== undefined && {
              name: input.name,
            }),

            ...(input.phone !== undefined && {
              phone: input.phone,
            }),

            ...(hashedPassword !== undefined && {
              password: hashedPassword,
            }),
          },
          tx,
        );
      }

      if (input.imageUrl !== undefined) {
        await profileRepository.updateProfile(
          user.id,
          {
            imageUrl: input.imageUrl,
          },
          tx,
        );
      }

      if (input.regionIds !== undefined) {
        await profileRepository.replaceServiceAreas(existingProfile.id, input.regionIds, tx);
      }

      if (input.serviceTypes !== undefined) {
        await profileRepository.replaceServiceTypes(existingProfile.id, input.serviceTypes, tx);
      }

      const updatedProfile = await profileRepository.findProfileByUserId(user.id, tx);

      if (!updatedProfile) {
        throw new AppError("NOT_FOUND", {
          message: "수정된 프로필을 찾을 수 없습니다.",
        });
      }

      return mapProfileResponse(updatedProfile);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const target = error.meta?.target;

      const fields = Array.isArray(target) ? target.map(String) : [String(target)];

      if (fields.some((field) => field.includes("phone"))) {
        throw new AppError("CONFLICT", {
          message: "이미 사용 중인 전화번호입니다.",
        });
      }

      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 정보입니다.",
      });
    }

    throw error;
  }
};

export const profileService = {
  createProfile,
  getMyProfile,
  getProfileStatus,
  updateProfile,
};
