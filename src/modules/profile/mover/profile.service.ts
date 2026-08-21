import bcrypt from "bcrypt";
import { RefreshTokenRevokedReason, RefreshTokenSessionType } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { runTransaction } from "../../../utils/transaction";

import { authRepository } from "../../auth/auth.repository";

import { cleanupImageSafely, rollbackFinalizedImageSafely } from "../profile-image.cleanup";
import { profileImageService } from "../profile-image.service";
import { hasUniqueConstraintField, PASSWORD_SALT_ROUNDS } from "../profile.shared";
import { mapMyProfileResponse, mapProfileResponse } from "./profile.mapper";
import { assertActiveMover } from "./profile.policy";
import { profileRepository } from "./profile.repository";

import type {
  CreateProfileInput,
  MyProfileResponse,
  ProfileResponse,
  UpdateBasicInfoInput,
  UpdateProfileInput,
} from "./profile.type";

/**
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

/**
 * 무버 프로필을 등록한다.
 *
 * 기존 User.phone이 없는 경우 프로필 생성 요청에서
 * 전화번호를 입력받아 User 테이블에 저장한다.
 *
 * User 전화번호 저장, 무버 프로필 생성,
 * 서비스 가능 지역 및 이사 유형 생성,
 * 프로필 완료 상태 변경을 하나의 트랜잭션으로 처리한다.
 *
 * 이미지가 전달된 경우:
 *
 * 1. temp 이미지 검증
 * 2. temp → profiles 경로로 복사
 * 3. DB에는 final Key 저장
 * 4. DB 성공 후 temp 객체 삭제
 * 5. DB 실패 시 생성된 final 객체 보상 삭제
 */
const createProfile = async (
  userId: string,
  input: CreateProfileInput,
): Promise<ProfileResponse> => {
  const user = assertActiveMover(await profileRepository.findUserById(userId));

  /**
   * S3 작업보다 먼저 처리할 수 있는
   * 비즈니스 검증을 우선 수행한다.
   */
  const existingProfile = await profileRepository.findProfileByUserId(user.id);

  if (existingProfile) {
    throw new AppError("CONFLICT", {
      message: "이미 등록된 프로필이 있습니다.",
    });
  }

  /**
   * 전화번호가 없는 사용자는 프로필 생성 시
   * 전화번호를 반드시 입력해야 한다.
   */
  if (user.phone === null && input.phone === undefined) {
    throw new AppError("BAD_REQUEST", {
      message: "휴대전화 번호를 입력해주세요.",
    });
  }

  /**
   * 기존 전화번호가 있는 사용자의 번호 변경은
   * 프로필 생성 API에서 처리하지 않는다.
   */
  if (user.phone !== null && input.phone !== undefined && input.phone !== user.phone) {
    throw new AppError("BAD_REQUEST", {
      message: "이미 등록된 휴대전화 번호는 프로필 생성 과정에서 변경할 수 없습니다.",
    });
  }

  /**
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

  /**
   * 닉네임 사전 중복 검증.
   *
   * 동시 요청에 대한 최종 무결성은
   * DB UNIQUE 제약조건이 보장한다.
   */
  const duplicatedProfile = await profileRepository.findProfileByNickname(input.nickname);

  if (duplicatedProfile) {
    throw new AppError("CONFLICT", {
      message: "이미 사용 중인 닉네임입니다.",
    });
  }

  await validateRegions(input.regionIds);

  /**
   * 신규 프로필 이미지 Key를 로컬 상수로 분리한다.
   *
   * string인 경우에만 temp 이미지로 취급한다.
   */
  const tempImageKey = typeof input.imageUrl === "string" ? input.imageUrl : undefined;

  /**
   * temp 이미지를 검증한 뒤
   * 최종 profiles 경로로 복사한다.
   */
  let finalizedImageKey: string | undefined;

  if (tempImageKey !== undefined) {
    finalizedImageKey = await profileImageService.finalizeUploadedImage(user.id, tempImageKey);
  }

  /**
   * phone은 User 테이블 필드이므로
   * MoverProfile 생성 데이터와 분리한다.
   *
   * DB에는 temp Key가 아닌 final Key만 저장한다.
   */
  const profileInput = {
    nickname: input.nickname,

    ...(finalizedImageKey !== undefined && {
      imageUrl: finalizedImageKey,
    }),

    career: input.career,
    shortIntro: input.shortIntro,
    description: input.description,
    activityBase: input.activityBase,
    regionIds: input.regionIds,
    serviceTypes: input.serviceTypes,
  };

  let profile;

  /**
   * 보상 삭제는 DB Transaction 자체가 실패한 경우에만 수행한다.
   */
  try {
    profile = await runTransaction(async (tx) => {
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
  } catch (error) {
    /**
     * temp → final 복사는 성공했지만
     * DB Transaction이 실패한 경우에만
     * 새로 생성한 final 객체를 보상 삭제한다.
     *
     * temp 원본은 Lifecycle 정리 대상으로 남긴다.
     */
    await rollbackFinalizedImageSafely(user.id, finalizedImageKey);

    /**
     * 동일한 전화번호 등록 요청이 동시에 들어온 경우
     * User.phone UNIQUE 제약조건으로 중복 저장을 막는다.
     */
    if (hasUniqueConstraintField(error, "phone")) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
      });
    }

    /**
     * 동일 사용자의 프로필 생성 요청이 동시에 들어온 경우
     * MoverProfile.userId UNIQUE 제약조건으로 하나만 성공한다.
     */
    if (hasUniqueConstraintField(error, "userId")) {
      throw new AppError("CONFLICT", {
        message: "이미 등록된 프로필이 있습니다.",
      });
    }

    /**
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

  /**
   * DB Transaction 성공 이후에만
   * temp 객체를 삭제한다.
   *
   * 삭제 실패 시 프로필 생성 자체는 성공 상태를 유지하며,
   * 남은 temp 객체는 Lifecycle에 의해 자동 정리된다.
   */
  if (tempImageKey !== undefined) {
    await cleanupImageSafely(
      () => profileImageService.deleteTemporaryImage(user.id, tempImageKey),
      {
        userId: user.id,
        key: tempImageKey,
        action: "DELETE_TEMP_IMAGE",
      },
    );
  }

  return mapProfileResponse(profile, await profileRepository.hasPasswordByUserId(user.id));
};

/**
 * 내 무버 프로필을 조회한다.
 */
const getMyProfile = async (userId: string): Promise<MyProfileResponse> => {
  const user = assertActiveMover(await profileRepository.findUserById(userId));

  const [profile, hasPassword, completedCount] = await Promise.all([
    profileRepository.findProfileByUserId(user.id),
    profileRepository.hasPasswordByUserId(user.id),
    profileRepository.countCompletedMovesByUserId(user.id),
  ]);

  if (!profile) {
    throw new AppError("NOT_FOUND", {
      message: "등록된 프로필이 없습니다.",
    });
  }

  return mapMyProfileResponse(profile, hasPassword, completedCount);
};

/**
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

/**
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

  /**
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
    /**
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

    /**
     * 비밀번호 변경이 요청된 경우에만
     * 비밀번호 해시를 포함한 사용자 정보를 조회한다.
     */
    const userWithPassword = assertActiveMover(
      await profileRepository.findUserWithPasswordById(user.id),
    );

    /**
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

    /**
     * 새 비밀번호는 현재 비밀번호와 달라야 한다.
     *
     * Validator에서도 검증하지만,
     * Service 직접 호출 가능성을 고려해 다시 확인한다.
     */
    if (input.currentPassword === input.newPassword) {
      throw new AppError("BAD_REQUEST", {
        message: "새 비밀번호는 현재 비밀번호와 달라야 합니다.",
      });
    }

    /**
     * bcrypt 해싱은 DB 작업이 아니므로 트랜잭션 밖에서 처리한다.
     * 트랜잭션의 DB 커넥션 점유 시간을 줄이기 위함이다.
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

      /**
       * 비밀번호가 실제로 변경된 경우
       * 해당 사용자의 활성 USER Refresh Token 세션을
       * 모두 폐기한다.
       *
       * User.password 수정과 Refresh Token revoke를
       * 동일한 트랜잭션에 포함하여 둘 중 하나만 반영되는
       * 상태를 방지한다.
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
    /**
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

/**
 * 내 무버 프로필을 수정한다.
 *
 * MoverProfile 테이블:
 * - nickname
 * - imageUrl
 * - career
 * - shortIntro
 * - description
 * - activityBase
 *
 * 관계 테이블:
 * - serviceAreas
 * - serviceTypes
 *
 * 이미지 수정 정책:
 *
 * - undefined: 이미지 변경 없음
 * - null: 기존 이미지 삭제
 * - string: 새로운 temp 이미지로 교체
 *
 * 관계 데이터는 기존 값을 삭제하고 새 값으로 교체하므로
 * 전체 DB 수정 작업은 하나의 트랜잭션으로 처리한다.
 */
const updateProfile = async (
  userId: string,
  input: UpdateProfileInput,
): Promise<ProfileResponse> => {
  const user = assertActiveMover(await profileRepository.findUserById(userId));

  /**
   * 기존 프로필 이미지 Key와 닉네임 비교가 필요하므로
   * S3 작업보다 먼저 현재 프로필을 조회한다.
   */
  const existingProfile = await profileRepository.findProfileByUserId(user.id);

  if (!existingProfile) {
    throw new AppError("NOT_FOUND", {
      message: "등록된 프로필이 없습니다.",
    });
  }

  /**
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

  /**
   * AWS 호출 전에 처리 가능한
   * 지역 비즈니스 검증을 먼저 수행한다.
   */
  if (input.regionIds !== undefined) {
    await validateRegions(input.regionIds);
  }

  /**
   * 새 이미지가 전달된 경우
   * callback 안에서도 string 타입을 유지하도록
   * 로컬 상수로 분리한다.
   */
  const tempImageKey = typeof input.imageUrl === "string" ? input.imageUrl : undefined;

  /**
   * 새 이미지가 전달된 경우에만
   * temp 이미지를 검증하고 최종 profiles 경로로 복사한다.
   */
  let finalizedImageKey: string | undefined;

  if (tempImageKey !== undefined) {
    finalizedImageKey = await profileImageService.finalizeUploadedImage(user.id, tempImageKey);
  }

  /**
   * 이미지 교체 또는 삭제가 정상 완료된 뒤
   * S3에서 정리할 기존 프로필 이미지 Key.
   */
  const previousImageKey = existingProfile.imageUrl;

  let updatedProfile;

  /**
   * 보상 삭제는 DB Transaction 실패에만 적용한다.
   */
  try {
    updatedProfile = await runTransaction(async (tx) => {
      /**
       * 무버 프로필 필드가 하나라도 전달된 경우에만
       * MoverProfile 테이블을 수정한다.
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

            /**
             * 명시적인 이미지 삭제 요청.
             */
            ...(input.imageUrl === null && {
              imageUrl: null,
            }),

            /**
             * 새 temp 이미지가 정상적으로 final 처리된 경우.
             *
             * DB에는 temp Key를 저장하지 않는다.
             */
            ...(finalizedImageKey !== undefined && {
              imageUrl: finalizedImageKey,
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

      /**
       * 지역 정보가 전달되면 기존 값을 모두 삭제하고
       * 새로운 지역 목록으로 교체한다.
       */
      if (input.regionIds !== undefined) {
        await profileRepository.replaceServiceAreas(existingProfile.id, input.regionIds, tx);
      }

      /**
       * 서비스 유형이 전달되면 기존 값을 모두 삭제하고
       * 새로운 서비스 유형 목록으로 교체한다.
       */
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
  } catch (error) {
    /**
     * temp → final 복사는 성공했지만
     * DB Transaction이 실패한 경우에만
     * 새로 생성된 final 객체를 보상 삭제한다.
     *
     * 기존 이미지와 기존 DB 데이터는 rollback으로 유지되고,
     * temp 객체는 Lifecycle 정리 대상으로 남긴다.
     */
    await rollbackFinalizedImageSafely(user.id, finalizedImageKey);

    /**
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

  /**
   * --------------------------------
   * DB Transaction 성공 이후 S3 정리
   * --------------------------------
   *
   * 여기서 발생하는 삭제 실패는 이미 성공한
   * 프로필 DB 수정 자체를 실패시키지 않는다.
   */
  if (tempImageKey !== undefined) {
    /**
     * 새 이미지가 정상 반영되었으므로
     * temp 객체를 삭제한다.
     *
     * 실패하면 로그를 남기고
     * Lifecycle이 최종 정리한다.
     */
    await cleanupImageSafely(
      () => profileImageService.deleteTemporaryImage(user.id, tempImageKey),
      {
        userId: user.id,
        key: tempImageKey,
        action: "DELETE_TEMP_IMAGE",
      },
    );

    /**
     * 기존 프로필 이미지가 있었다면
     * DB에서 더 이상 참조하지 않으므로 삭제한다.
     */
    if (previousImageKey && previousImageKey !== finalizedImageKey) {
      await cleanupImageSafely(
        () => profileImageService.deleteProfileImage(user.id, previousImageKey),
        {
          userId: user.id,
          key: previousImageKey,
          action: "DELETE_PREVIOUS_IMAGE",
        },
      );
    }
  } else if (input.imageUrl === null) {
    /**
     * 프로필 이미지 삭제 요청.
     *
     * DB에서 imageUrl = null 처리가 정상 커밋된 이후
     * 기존 S3 객체를 삭제한다.
     */
    if (previousImageKey) {
      await cleanupImageSafely(
        () => profileImageService.deleteProfileImage(user.id, previousImageKey),
        {
          userId: user.id,
          key: previousImageKey,
          action: "DELETE_PREVIOUS_IMAGE",
        },
      );
    }
  }

  return mapProfileResponse(updatedProfile, await profileRepository.hasPasswordByUserId(user.id));
};

export const profileService = {
  createProfile,
  getMyProfile,
  getProfileStatus,
  updateBasicInfo,
  updateProfile,
};
