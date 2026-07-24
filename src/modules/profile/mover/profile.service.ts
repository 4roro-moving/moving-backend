import bcrypt from "bcrypt";
import { Prisma, UserRole } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { runTransaction } from "../../../utils/transaction";

import { profileRepository } from "./profile.repository";
import type {
  CreateProfileInput,
  ProfileResponse,
  UpdateBasicInfoInput,
  UpdateProfileInput,
} from "./profile.type";

const PASSWORD_SALT_ROUNDS = 10;

/*
 * Prisma P2002 UNIQUE 제약조건 에러인지 확인하고,
 * 어떤 필드에서 발생했는지 판별한다.
 *
 * 프로필 생성 전 닉네임 중복 조회와
 * 전화번호 및 닉네임 수정 전 중복 조회는 빠른 응답을 위한 처리이며,
 * 동시 요청은 DB UNIQUE 제약조건으로 막는다.
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
 * 프로필 기능을 이용할 수 있는 활성 무버인지 확인한다.
 *
 * 전달받은 사용자 객체의 타입을 그대로 반환하도록 제네릭을 사용한다.
 * 따라서 일반 사용자 조회 결과와 비밀번호 포함 조회 결과에
 * 동일한 검증 함수를 사용할 수 있다.
 */
const validateActiveMover = <
  T extends {
    isActive: boolean;
    deletedAt: Date | null;
    role: UserRole;
  },
>(
  user: T | null,
): T => {
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

  if (user.role !== UserRole.MOVER) {
    throw new AppError("FORBIDDEN", {
      message: "기사님만 이용할 수 있습니다.",
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
 * Prisma 조회 결과를 무버 프로필 응답 형식으로 변환한다.
 */
const mapProfileResponse = (
  profile: NonNullable<Awaited<ReturnType<typeof profileRepository.findProfileByUserId>>>,
): ProfileResponse => {
  return {
    id: profile.id,
    userId: profile.userId,

    name: profile.user.name,
    phone: profile.user.phone,

    nickname: profile.nickname,
    imageUrl: profile.imageUrl,
    career: profile.career,
    shortIntro: profile.shortIntro,
    description: profile.description,

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

/*
 * 무버 프로필 등록
 *
 * 무버 프로필, 서비스 가능 지역, 이사 유형을 생성하고
 * User.isProfileCompleted를 true로 변경한다.
 *
 * 모든 작업은 하나의 트랜잭션으로 처리한다.
 */
const createProfile = async (
  userId: string,
  input: CreateProfileInput,
): Promise<ProfileResponse> => {
  const user = validateActiveMover(await profileRepository.findUserById(userId));

  const existingProfile = await profileRepository.findProfileByUserId(user.id);

  if (existingProfile) {
    throw new AppError("CONFLICT", {
      message: "이미 등록된 프로필이 있습니다.",
    });
  }

  const duplicatedProfile = await profileRepository.findProfileByNickname(input.nickname);

  if (duplicatedProfile) {
    throw new AppError("CONFLICT", {
      message: "이미 사용 중인 닉네임입니다.",
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
    /*
     * 동일 사용자의 프로필 생성 요청이 동시에 들어온 경우
     * MoverProfile.userId UNIQUE 제약조건으로 하나만 성공한다.
     */
    if (isUniqueConstraintError(error, "userId")) {
      throw new AppError("CONFLICT", {
        message: "이미 등록된 프로필이 있습니다.",
      });
    }

    /*
     * 동일한 닉네임 생성 요청이 동시에 들어온 경우
     * MoverProfile.nickname UNIQUE 제약조건으로 중복 저장을 막는다.
     */
    if (isUniqueConstraintError(error, "nickname")) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 닉네임입니다.",
      });
    }

    throw error;
  }
};

/*
 * 내 무버 프로필 조회
 */
const getMyProfile = async (userId: string): Promise<ProfileResponse> => {
  const user = validateActiveMover(await profileRepository.findUserById(userId));

  const profile = await profileRepository.findProfileByUserId(user.id);

  if (!profile) {
    throw new AppError("NOT_FOUND", {
      message: "등록된 프로필이 없습니다.",
    });
  }

  return mapProfileResponse(profile);
};

/*
 * 무버 프로필 등록 여부 확인
 *
 * User.isProfileCompleted 값과 실제 MoverProfile 존재 여부를
 * 함께 확인하여 데이터 불일치 상황에서 잘못된 완료 응답을 막는다.
 */
const getProfileStatus = async (
  userId: string,
): Promise<{
  isProfileCompleted: boolean;
}> => {
  const user = validateActiveMover(await profileRepository.findUserById(userId));

  const profile = await profileRepository.findProfileByUserId(user.id);

  return {
    isProfileCompleted: user.isProfileCompleted && profile !== null,
  };
};

/*
 * 내 무버 기본정보 수정
 *
 * User 테이블:
 * - name
 * - phone
 * - password
 */
const updateBasicInfo = async (
  userId: string,
  input: UpdateBasicInfoInput,
): Promise<ProfileResponse> => {
  const user = validateActiveMover(await profileRepository.findUserById(userId));

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

    /*
     * 비밀번호 변경이 요청된 경우에만
     * 비밀번호 해시를 포함한 사용자 정보를 조회한다.
     */
    const userWithPassword = validateActiveMover(
      await profileRepository.findUserWithPasswordById(user.id),
    );

    if (!userWithPassword.password) {
      throw new AppError("BAD_REQUEST", {
        message: "소셜 로그인 계정은 비밀번호를 변경할 수 없습니다.",
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      input.currentPassword,
      userWithPassword.password,
    );

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
    const updatedProfile = await runTransaction(async (tx) => {
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

/*
 * 내 무버 프로필 수정
 *
 * MoverProfile 테이블:
 * - nickname
 * - imageUrl
 * - career
 * - shortIntro
 * - description
 *
 * 관계 테이블:
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
  const user = validateActiveMover(await profileRepository.findUserById(userId));

  const existingProfile = await profileRepository.findProfileByUserId(user.id);

  if (!existingProfile) {
    throw new AppError("NOT_FOUND", {
      message: "등록된 프로필이 없습니다.",
    });
  }

  /*
   * 닉네임이 실제로 변경되는 경우에만
   * 현재 무버를 제외하고 중복 여부를 확인한다.
   */
  if (input.nickname !== undefined && input.nickname !== existingProfile.nickname) {
    const duplicatedProfile = await profileRepository.findProfileByNicknameExcludingUser(
      input.nickname,
      user.id,
    );

    if (duplicatedProfile) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 닉네임입니다.",
      });
    }
  }

  if (input.regionIds !== undefined) {
    await validateRegions(input.regionIds);
  }

  try {
    const updatedProfile = await runTransaction(async (tx) => {
      /*
       * 무버 프로필 필드가 하나라도 전달된 경우에만
       * MoverProfile 테이블을 수정한다.
       *
       * imageUrl:
       * - undefined: 이미지 수정 없음
       * - null: 기존 이미지 삭제
       * - string: 새 이미지로 변경
       */
      const hasProfileUpdate =
        input.nickname !== undefined ||
        input.imageUrl !== undefined ||
        input.career !== undefined ||
        input.shortIntro !== undefined ||
        input.description !== undefined;

      if (hasProfileUpdate) {
        await profileRepository.updateProfile(
          user.id,
          {
            ...(input.nickname !== undefined && {
              nickname: input.nickname,
            }),

            ...(input.imageUrl !== undefined && {
              imageUrl: input.imageUrl,
            }),

            ...(input.career !== undefined && {
              career: input.career,
            }),

            ...(input.shortIntro !== undefined && {
              shortIntro: input.shortIntro,
            }),

            ...(input.description !== undefined && {
              description: input.description,
            }),
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
     * 닉네임 수정 요청이 동시에 들어온 경우
     * MoverProfile.nickname UNIQUE 제약조건으로 중복 저장을 막는다.
     */
    if (isUniqueConstraintError(error, "nickname")) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 닉네임입니다.",
      });
    }

    throw error;
  }
};

export const profileService = {
  createProfile,
  getMyProfile,
  getProfileStatus,
  updateBasicInfo,
  updateProfile,
};
