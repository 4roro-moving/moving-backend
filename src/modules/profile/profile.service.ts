import { Prisma, UserRole } from "@prisma/client";

import { profileRepository } from "./profile.repository";

import type { CreateProfileInput, ProfileResponse, UpdateProfileInput } from "./profile.type";

import { AppError } from "../../lib/app-error";
import { runTransaction } from "../../utils/transaction";

/*
 * Prisma P2002 UNIQUE 제약조건 에러인지 확인하고,
 * 어떤 필드에서 발생했는지 판별한다.
 *
 * 프로필 생성 전 중복 조회와 전화번호 수정 전 중복 조회는
 * 빠른 응답을 위한 처리이며, 동시 요청은 DB UNIQUE 제약조건으로 막는다.
 */
const isUniqueConstraintError = (
  error: unknown,
  fieldName: string,
): error is Prisma.PrismaClientKnownRequestError => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  const normalizedFieldName = fieldName.toLowerCase();

  if (Array.isArray(target)) {
    return target.some((field) => String(field).toLowerCase() === normalizedFieldName);
  }

  return String(target).toLowerCase().includes(normalizedFieldName);
};

/*
 * 프로필 기능을 이용할 수 있는 활성 고객인지 확인한다.
 */
const validateActiveCustomer = (
  user: Awaited<ReturnType<typeof profileRepository.findUserById>>,
) => {
  if (!user) {
    throw new AppError("NOT_FOUND", {
      message: "사용자를 찾을 수 없습니다.",
    });
  }

  if (!user.isActive || user.deletedAt !== null) {
    throw new AppError("FORBIDDEN", {
      message: "비활성화되었거나 탈퇴 처리된 계정입니다.",
    });
  }

  if (user.role !== UserRole.CUSTOMER) {
    throw new AppError("FORBIDDEN", {
      message: "일반 사용자만 이용할 수 있습니다.",
    });
  }

  return user;
};

/*
 * 전달받은 지역 ID가 모두 실제 존재하는 지역인지 확인한다.
 *
 * 배열의 중복 여부와 최대 개수는 Validator에서 확인하고,
 * DB 존재 여부는 Service에서 확인한다.
 */
const validateRegions = async (regionIds: number[]): Promise<void> => {
  const regionCount = await profileRepository.countRegionsByIds(regionIds);

  if (regionCount !== regionIds.length) {
    throw new AppError("BAD_REQUEST", {
      message: "존재하지 않는 지역이 포함되어 있습니다.",
    });
  }
};

/*
 * Prisma 조회 결과를 고객 프로필 응답 형식으로 변환한다.
 */
const mapProfileResponse = (
  profile: NonNullable<Awaited<ReturnType<typeof profileRepository.findProfileByUserId>>>,
): ProfileResponse => {
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.user.name,
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

/*
 * 고객 프로필 등록
 *
 * 고객 프로필, 서비스 가능 지역, 이사 유형을 생성하고
 * User.isProfileCompleted를 true로 변경한다.
 *
 * 모든 작업은 하나의 트랜잭션으로 처리한다.
 */
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
      const createdProfile = await profileRepository.createProfile(
        {
          userId: user.id,
          ...(input.imageUrl !== undefined && {
            imageUrl: input.imageUrl,
          }),
          regionIds: input.regionIds,
          serviceTypes: input.serviceTypes,
        },
        tx,
      );

      await profileRepository.markProfileCompleted(user.id, tx);

      return createdProfile;
    });

    return mapProfileResponse(profile);
  } catch (error) {
    /*
     * 동일 사용자의 프로필 생성 요청이 동시에 들어온 경우
     * CustomerProfile.userId UNIQUE 제약조건으로 하나만 성공한다.
     */
    if (isUniqueConstraintError(error, "userId")) {
      throw new AppError("CONFLICT", {
        message: "이미 등록된 프로필이 있습니다.",
      });
    }

    throw error;
  }
};

/*
 * 내 고객 프로필 조회
 */
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

/*
 * 고객 프로필 등록 여부 확인
 *
 * User.isProfileCompleted 값과 실제 CustomerProfile 존재 여부를
 * 함께 확인하여 데이터 불일치 상황에서 잘못된 완료 응답을 막는다.
 */
const getProfileStatus = async (userId: string): Promise<{ isProfileCompleted: boolean }> => {
  const user = validateActiveCustomer(await profileRepository.findUserById(userId));

  const profile = await profileRepository.findProfileByUserId(user.id);

  return {
    isProfileCompleted: user.isProfileCompleted && profile !== null,
  };
};

/*
 * 내 고객 프로필 수정
 *
 * User 테이블:
 * - name
 * - phone
 *
 * CustomerProfile 및 관계 테이블:
 * - imageUrl
 * - serviceAreas
 * - serviceTypes
 *
 * 관계 데이터는 기존 값을 삭제하고 새 값으로 교체하므로
 * 전체 수정 작업을 하나의 트랜잭션으로 처리한다.
 */
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

  /*
   * 전화번호가 실제로 변경되는 경우에만
   * 현재 사용자를 제외하고 중복 여부를 확인한다.
   */
  if (input.phone !== undefined && input.phone !== user.phone) {
    const duplicatedUser = await profileRepository.findUserByPhoneExcludingUser(
      input.phone,
      user.id,
    );

    if (duplicatedUser) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
      });
    }
  }

  if (input.regionIds !== undefined) {
    await validateRegions(input.regionIds);
  }

  try {
    const updatedProfile = await runTransaction(async (tx) => {
      /*
       * name 또는 phone이 전달된 경우에만
       * User 테이블을 수정한다.
       */
      if (input.name !== undefined || input.phone !== undefined) {
        await profileRepository.updateUser(
          user.id,
          {
            ...(input.name !== undefined && {
              name: input.name,
            }),
            ...(input.phone !== undefined && {
              phone: input.phone,
            }),
          },
          tx,
        );
      }

      /*
       * undefined는 이미지 수정 없음,
       * null은 기존 프로필 이미지 삭제를 의미한다.
       */
      if (input.imageUrl !== undefined) {
        await profileRepository.updateProfileImage(user.id, input.imageUrl, tx);
      }

      if (input.regionIds !== undefined) {
        await profileRepository.replaceServiceAreas(existingProfile.id, input.regionIds, tx);
      }

      if (input.serviceTypes !== undefined) {
        await profileRepository.replaceServiceTypes(existingProfile.id, input.serviceTypes, tx);
      }

      const profile = await profileRepository.findProfileByUserId(user.id, tx);

      if (!profile) {
        throw new AppError("NOT_FOUND", {
          message: "수정된 프로필을 찾을 수 없습니다.",
        });
      }

      return profile;
    });

    return mapProfileResponse(updatedProfile);
  } catch (error) {
    /*
     * 전화번호 수정 요청이 동시에 들어온 경우
     * User.phone UNIQUE 제약조건으로 중복 저장을 막는다.
     */
    if (isUniqueConstraintError(error, "phone")) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
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
