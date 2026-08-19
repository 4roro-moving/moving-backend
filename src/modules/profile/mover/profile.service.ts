import bcrypt from "bcrypt";
import { RefreshTokenSessionType, RefreshTokenRevokedReason } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { runTransaction } from "../../../utils/transaction";

import { authRepository } from "../../auth/auth.repository";

import { profileImageService } from "../profile-image.service";
import { hasUniqueConstraintField, PASSWORD_SALT_ROUNDS } from "../profile.shared";
import { mapProfileResponse } from "./profile.mapper";
import { assertActiveMover } from "./profile.policy";
import { profileRepository } from "./profile.repository";

import type {
  CreateProfileInput,
  ProfileResponse,
  UpdateBasicInfoInput,
  UpdateProfileInput,
} from "./profile.type";

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
 * 무버 프로필을 등록한다.
 *
 * 기존 User.phone이 없는 경우 프로필 생성 요청에서
 * 전화번호를 입력받아 User 테이블에 저장한다.
 *
 * User 전화번호 저장, 무버 프로필 생성,
 * 서비스 가능 지역 및 이사 유형 생성,
 * 프로필 완료 상태 변경을 하나의 트랜잭션으로 처리한다.
 */
const createProfile = async (
  userId: string,
  input: CreateProfileInput,
): Promise<ProfileResponse> => {
  const user = assertActiveMover(await profileRepository.findUserById(userId));

  /*
   * 이미지가 전달된 경우 현재 로그인한 사용자의 Key인지 확인하고,
   * S3에 실제 객체가 존재하며 형식과 크기가 올바른지 검증한다.
   */
  await profileImageService.validateUploadedImage(user.id, input.imageUrl);

  const existingProfile = await profileRepository.findProfileByUserId(user.id);

  if (existingProfile) {
    throw new AppError("CONFLICT", {
      message: "이미 등록된 프로필이 있습니다.",
    });
  }

  /*
   * 전화번호가 없는 사용자는 프로필 생성 시
   * 전화번호를 반드시 입력해야 한다.
   */
  if (user.phone === null && input.phone === undefined) {
    throw new AppError("BAD_REQUEST", {
      message: "휴대전화 번호를 입력해주세요.",
    });
  }

  /*
   * 기존 전화번호가 있는 사용자의 번호 변경은
   * 프로필 생성 API에서 처리하지 않는다.
   */
  if (user.phone !== null && input.phone !== undefined && input.phone !== user.phone) {
    throw new AppError("BAD_REQUEST", {
      message: "이미 등록된 휴대전화 번호는 프로필 생성 과정에서 변경할 수 없습니다.",
    });
  }

  /*
   * 기존 전화번호가 없는 경우에만
   * 요청으로 전달된 전화번호를 저장한다.
   */
  const phoneToSave = user.phone === null ? input.phone : undefined;

  if (phoneToSave !== undefined) {
    const duplicatedUser = await profileRepository.findUserByPhoneExcludingUser(
      phoneToSave,
      user.id,
    );

    if (duplicatedUser) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
      });
    }
  }

  const duplicatedProfile = await profileRepository.findProfileByNickname(input.nickname);

  if (duplicatedProfile) {
    throw new AppError("CONFLICT", {
      message: "이미 사용 중인 닉네임입니다.",
    });
  }

  await validateRegions(input.regionIds);

  /*
   * phone은 User 테이블 필드이므로
   * MoverProfile 생성 데이터와 분리한다.
   */
  const profileInput = {
    nickname: input.nickname,

    ...(input.imageUrl !== undefined && {
      imageUrl: input.imageUrl,
    }),

    career: input.career,
    shortIntro: input.shortIntro,
    description: input.description,
    activityBase: input.activityBase,
    regionIds: input.regionIds,
    serviceTypes: input.serviceTypes,
  };

  try {
    const profile = await runTransaction(async (tx) => {
      if (phoneToSave !== undefined) {
        await profileRepository.updateUser(
          user.id,
          {
            phone: phoneToSave,
          },
          tx,
        );
      }

      const createdProfile = await profileRepository.createProfile(user.id, profileInput, tx);

      await profileRepository.markProfileCompleted(user.id, tx);

      return createdProfile;
    });

    return mapProfileResponse(profile, await profileRepository.hasPasswordByUserId(user.id));
  } catch (error) {
    /*
     * 동일한 전화번호 등록 요청이 동시에 들어온 경우
     * User.phone UNIQUE 제약조건으로 중복 저장을 막는다.
     */
    if (hasUniqueConstraintField(error, "phone")) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
      });
    }

    /*
     * 동일 사용자의 프로필 생성 요청이 동시에 들어온 경우
     * MoverProfile.userId UNIQUE 제약조건으로 하나만 성공한다.
     */
    if (hasUniqueConstraintField(error, "userId")) {
      throw new AppError("CONFLICT", {
        message: "이미 등록된 프로필이 있습니다.",
      });
    }

    /*
     * 동일한 닉네임 생성 요청이 동시에 들어온 경우
     * MoverProfile.nickname UNIQUE 제약조건으로 중복 저장을 막는다.
     */
    if (hasUniqueConstraintField(error, "nickname")) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 닉네임입니다.",
      });
    }

    throw error;
  }
};

/*
 * 내 무버 프로필을 조회한다.
 */
const getMyProfile = async (userId: string): Promise<ProfileResponse> => {
  const user = assertActiveMover(await profileRepository.findUserById(userId));

  const profile = await profileRepository.findProfileByUserId(user.id);

  if (!profile) {
    throw new AppError("NOT_FOUND", {
      message: "등록된 프로필이 없습니다.",
    });
  }

  return mapProfileResponse(profile, await profileRepository.hasPasswordByUserId(user.id));
};

/*
 * 무버 프로필 등록 상태와 전화번호 보유 여부를 조회한다.
 *
 * User.isProfileCompleted 값과 실제 MoverProfile 존재 여부를
 * 함께 확인하여 데이터 불일치 상황에서 잘못된 완료 응답을 막는다.
 */
const getProfileStatus = async (
  userId: string,
): Promise<{
  isProfileCompleted: boolean;
  hasPhone: boolean;
}> => {
  const validatedUser = assertActiveMover(await profileRepository.findUserById(userId));

  const profile = await profileRepository.findProfileByUserId(validatedUser.id);

  return {
    isProfileCompleted: validatedUser.isProfileCompleted && profile !== null,
    hasPhone: validatedUser.phone !== null,
  };
};

/*
 * 내 무버 기본정보를 수정한다.
 *
 * User 테이블:
 * - name
 * - phone
 * - password
 *
 * 비밀번호가 변경되는 경우 해당 사용자의 기존 USER
 * Refresh Token 세션을 모두 폐기한다.
 *
 * 비밀번호 변경과 세션 폐기는 동일한 트랜잭션으로 처리한다.
 */
const updateBasicInfo = async (
  userId: string,
  input: UpdateBasicInfoInput,
): Promise<ProfileResponse> => {
  const user = assertActiveMover(await profileRepository.findUserById(userId));

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
    /*
     * 비밀번호 변경을 요청한 경우
     * 세 가지 값을 모두 입력해야 한다.
     */
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
    const userWithPassword = assertActiveMover(
      await profileRepository.findUserWithPasswordById(user.id),
    );

    /*
     * 비밀번호가 등록되지 않은 계정은
     * 현재 비밀번호를 기반으로 한 변경 방식을 사용할 수 없다.
     */
    if (!userWithPassword.password) {
      throw new AppError("BAD_REQUEST", {
        message: "비밀번호가 등록되지 않은 계정은 비밀번호를 변경할 수 없습니다.",
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

    /*
     * 새 비밀번호는 현재 비밀번호와 달라야 한다.
     *
     * Validator에서 먼저 검증하지만,
     * Service가 다른 경로에서 직접 호출될 가능성을 고려해
     * 비즈니스 규칙을 한 번 더 검증한다.
     */
    if (input.currentPassword === input.newPassword) {
      throw new AppError("BAD_REQUEST", {
        message: "새 비밀번호는 현재 비밀번호와 달라야 합니다.",
      });
    }

    /*
     * bcrypt 해싱은 DB 작업이 아니므로 트랜잭션 밖에서 처리한다.
     * 트랜잭션이 DB 커넥션을 점유하는 시간을 줄이기 위함이다.
     */
    hashedPassword = await bcrypt.hash(input.newPassword, PASSWORD_SALT_ROUNDS);
  }

  try {
    const updatedProfile = await runTransaction(async (tx) => {
      const userUpdateData = {
        ...(input.name !== undefined &&
          input.name !== user.name && {
            name: input.name,
          }),

        ...(input.phone !== undefined &&
          input.phone !== user.phone && {
            phone: input.phone,
          }),

        ...(hashedPassword !== undefined && {
          password: hashedPassword,
        }),
      };

      if (Object.keys(userUpdateData).length > 0) {
        await profileRepository.updateUser(user.id, userUpdateData, tx);
      }

      /*
       * 비밀번호가 실제로 변경된 경우
       * 해당 사용자의 아직 활성 상태인 USER
       * Refresh Token 세션을 모두 폐기한다.
       *
       * 비밀번호 변경에 따른 보안 목적의 세션 폐기이므로
       * 폐기 사유는 FORCED로 기록한다.
       *
       * User.password 수정과 Refresh Token revoke를
       * 동일한 트랜잭션에 포함하여
       * 둘 중 하나만 반영되는 상태를 방지한다.
       */
      if (hashedPassword !== undefined) {
        await authRepository.revokeAllRefreshTokensByUserId(
          user.id,
          RefreshTokenSessionType.USER,
          RefreshTokenRevokedReason.FORCED,
          tx,
        );
      }

      const profile = await profileRepository.findProfileByUserId(user.id, tx);

      if (!profile) {
        throw new AppError("NOT_FOUND", {
          message: "수정된 프로필을 찾을 수 없습니다.",
        });
      }

      return profile;
    });

    const hasPassword =
      hashedPassword !== undefined ? true : await profileRepository.hasPasswordByUserId(user.id);

    return mapProfileResponse(updatedProfile, hasPassword);
  } catch (error) {
    /*
     * 전화번호 수정 요청이 동시에 들어온 경우
     * User.phone UNIQUE 제약조건으로 중복 저장을 막는다.
     */
    if (hasUniqueConstraintField(error, "phone")) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
      });
    }

    throw error;
  }
};

/*
 * 내 무버 프로필을 수정한다.
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
  const user = assertActiveMover(await profileRepository.findUserById(userId));

  /*
   * 새 이미지 Key가 전달된 경우 현재 로그인한 사용자의 Key인지 확인하고,
   * S3에 실제 객체가 존재하며 형식과 크기가 올바른지 검증한다.
   *
   * null은 기존 이미지 삭제 요청이므로 S3 검증 없이 허용한다.
   */
  await profileImageService.validateUploadedImage(user.id, input.imageUrl);

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
       * - string: 새 이미지 Key로 변경
       */
      const hasProfileUpdate =
        input.nickname !== undefined ||
        input.imageUrl !== undefined ||
        input.career !== undefined ||
        input.shortIntro !== undefined ||
        input.description !== undefined ||
        input.activityBase !== undefined;

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

            ...(input.activityBase !== undefined && {
              activityBaseAddress: input.activityBase.address,
              activityBaseDetailAddress: input.activityBase.detailAddress ?? null,
              activityBaseZipCode: input.activityBase.zipCode,
              activityBaseLatitude: input.activityBase.latitude,
              activityBaseLongitude: input.activityBase.longitude,
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

    return mapProfileResponse(updatedProfile, await profileRepository.hasPasswordByUserId(user.id));
  } catch (error) {
    /*
     * 닉네임 수정 요청이 동시에 들어온 경우
     * MoverProfile.nickname UNIQUE 제약조건으로 중복 저장을 막는다.
     */
    if (hasUniqueConstraintField(error, "nickname")) {
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
