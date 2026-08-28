import bcrypt from "bcrypt";
import { RefreshTokenRevokedReason, RefreshTokenSessionType } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { runTransaction } from "../../../utils/transaction";

import { authRepository } from "../../auth/auth.repository";

import { cleanupImageSafely, rollbackFinalizedImageSafely } from "../profile-image.cleanup";
import { profileImageService } from "../profile-image.service";
import { hasUniqueConstraintField, PASSWORD_SALT_ROUNDS } from "../profile.shared";
import { mapProfileResponse } from "./profile.mapper";
import { assertActiveCustomer } from "./profile.policy";
import { profileRepository } from "./profile.repository";

import type {
  CreateProfileInput,
  ProfileResponse,
  UpdateBasicInfoInput,
  UpdateProfileInput,
} from "./profile.type";

/**
 * 요청에 포함된 지역 ID가 모두 존재하는지 확인한다.
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
 * 고객 프로필을 생성한다.
 *
 * 기존 User.phone이 없는 경우 프로필 생성 요청의
 * phone을 필수로 검증한 뒤 User 테이블에 함께 저장한다.
 *
 * 새 이미지가 전달된 경우:
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
  const user = assertActiveCustomer(await profileRepository.findUserById(userId));

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
   * 기존 전화번호가 있는 사용자의 전화번호 변경은
   * 프로필 생성 API에서 처리하지 않는다.
   */
  if (user.phone !== null && input.phone !== undefined && input.phone !== user.phone) {
    throw new AppError("BAD_REQUEST", {
      message: "이미 등록된 휴대전화 번호는 프로필 생성 과정에서 변경할 수 없습니다.",
    });
  }

  const phoneToSave = user.phone === null ? input.phone : undefined;

  if (phoneToSave !== undefined) {
    const phoneOwner = await profileRepository.findUserByPhoneExcludingUser(phoneToSave, user.id);

    if (phoneOwner) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
      });
    }
  }

  await validateRegions(input.regionIds);

  /**
   * 신규 프로필 이미지 Key.
   *
   * string인 경우에만 temp 이미지로 취급한다.
   */
  const tempImageKey = typeof input.imageUrl === "string" ? input.imageUrl : undefined;

  /**
   * 신규 이미지가 있다면
   * temp 이미지를 검증하고 최종 profiles 경로로 복사한다.
   */
  let finalizedImageKey: string | undefined;

  if (tempImageKey !== undefined) {
    finalizedImageKey = await profileImageService.finalizeUploadedImage(user.id, tempImageKey);
  }

  /**
   * phone은 User 테이블의 필드이므로
   * CustomerProfile 생성 데이터와 분리한다.
   *
   * DB에는 temp Key가 아닌 final Key만 저장한다.
   */
  const profileInput = {
    ...(finalizedImageKey !== undefined && {
      imageUrl: finalizedImageKey,
    }),

    regionIds: input.regionIds,
    serviceTypes: input.serviceTypes,
  };

  let profile;

  /**
   * 보상 삭제는 DB Transaction 자체가 실패한 경우에만 수행한다.
   *
   * DB 커밋 이후 실행되는 temp 정리나 응답 조회 실패 때문에
   * 이미 정상 저장된 final 이미지를 삭제하면 안 된다.
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
     * 원본 temp 객체는 Lifecycle 정리 대상으로 남긴다.
     */
    await rollbackFinalizedImageSafely(user.id, finalizedImageKey);

    if (hasUniqueConstraintField(error, "phone")) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
      });
    }

    if (hasUniqueConstraintField(error, "userId")) {
      throw new AppError("CONFLICT", {
        message: "이미 등록된 프로필 정보입니다.",
      });
    }

    throw error;
  }

  /**
   * -------------------------------
   * DB Transaction 성공 이후 작업
   * -------------------------------
   *
   * 여기부터 실패하더라도 이미 DB는 정상 커밋된 상태이므로
   * final 이미지를 보상 삭제하지 않는다.
   */

  if (tempImageKey !== undefined) {
    /**
     * temp 객체는 더 이상 필요하지 않으므로 삭제한다.
     *
     * 삭제에 실패해도 프로필 생성은 성공 상태를 유지하며
     * 남은 temp 객체는 Lifecycle이 최종 정리한다.
     */
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
 * 현재 로그인한 고객의 프로필을 조회한다.
 */
const getMyProfile = async (userId: string): Promise<ProfileResponse> => {
  const user = assertActiveCustomer(await profileRepository.findUserById(userId));

  const profile = await profileRepository.findProfileByUserId(user.id);

  if (!profile) {
    throw new AppError("NOT_FOUND", {
      message: "등록된 프로필이 없습니다.",
    });
  }

  return mapProfileResponse(profile, await profileRepository.hasPasswordByUserId(user.id));
};

/**
 * 고객의 프로필 등록 상태와
 * 전화번호 보유 여부를 조회한다.
 */
const getProfileStatus = async (
  userId: string,
): Promise<{
  isProfileCompleted: boolean;
  hasPhone: boolean;
}> => {
  const user = assertActiveCustomer(await profileRepository.findUserById(userId));

  const profile = await profileRepository.findProfileByUserId(user.id);

  return {
    isProfileCompleted: user.isProfileCompleted && profile !== null,
    hasPhone: user.phone !== null,
  };
};

/**
 * 현재 로그인한 고객의 기본정보를 수정한다.
 *
 * User 테이블:
 * - name
 * - phone
 * - password
 *
 * 비밀번호가 변경되는 경우 기존 USER Refresh Token 세션을
 * 모두 폐기하여 재로그인을 요구한다.
 *
 * 비밀번호 변경과 Refresh Token 세션 폐기는
 * 하나의 트랜잭션으로 처리한다.
 */
const updateBasicInfo = async (
  userId: string,
  input: UpdateBasicInfoInput,
): Promise<ProfileResponse> => {
  const user = assertActiveCustomer(await profileRepository.findUserById(userId));

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
    const phoneOwner = await profileRepository.findUserByPhoneExcludingUser(input.phone, user.id);

    if (phoneOwner) {
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
     * 비밀번호 변경 요청 시 세 필드를 모두 전달해야 한다.
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

    const userWithPassword = assertActiveCustomer(
      await profileRepository.findUserWithPasswordById(user.id),
    );

    /**
     * 비밀번호가 등록되지 않은 계정은
     * 현재 비밀번호 기반의 변경 방식을 사용할 수 없다.
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

    if (input.currentPassword === input.newPassword) {
      throw new AppError("BAD_REQUEST", {
        message: "새 비밀번호는 현재 비밀번호와 달라야 합니다.",
      });
    }

    /**
     * bcrypt 해시는 DB 작업이 아니므로
     * 트랜잭션 밖에서 처리하여 커넥션 점유 시간을 줄인다.
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
       * 해당 사용자의 기존 USER Refresh Token 세션을
       * 모두 폐기하여 재로그인을 요구한다.
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
    if (hasUniqueConstraintField(error, "phone")) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
      });
    }

    throw error;
  }
};

/**
 * 현재 로그인한 고객의 프로필 정보를 수정한다.
 *
 * CustomerProfile 테이블:
 * - imageUrl
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
 */
const updateProfile = async (
  userId: string,
  input: UpdateProfileInput,
): Promise<ProfileResponse> => {
  const user = assertActiveCustomer(await profileRepository.findUserById(userId));

  /**
   * 기존 이미지 Key가 필요하므로
   * S3 작업 전에 현재 프로필을 먼저 조회한다.
   */
  const existingProfile = await profileRepository.findProfileByUserId(user.id);

  if (!existingProfile) {
    throw new AppError("NOT_FOUND", {
      message: "등록된 프로필이 없습니다.",
    });
  }

  /**
   * AWS 호출보다 먼저 처리 가능한
   * 비즈니스 검증을 수행한다.
   */
  if (input.regionIds !== undefined) {
    await validateRegions(input.regionIds);
  }

  /**
   * 새 이미지가 전달된 경우
   * callback 내부에서도 string 타입을 유지할 수 있도록
   * 로컬 상수로 분리한다.
   */
  const tempImageKey = typeof input.imageUrl === "string" ? input.imageUrl : undefined;

  /**
   * temp 이미지를 검증하고
   * 최종 profiles 경로로 복사한다.
   */
  let finalizedImageKey: string | undefined;

  if (tempImageKey !== undefined) {
    finalizedImageKey = await profileImageService.finalizeUploadedImage(user.id, tempImageKey);
  }

  /**
   * 이미지 교체 또는 삭제 성공 후
   * 제거해야 할 기존 이미지 Key.
   */
  const previousImageKey = existingProfile.imageUrl;

  let updatedProfile;

  /**
   * 보상 삭제는 DB Transaction 실패에만 적용한다.
   */
  try {
    updatedProfile = await runTransaction(async (tx) => {
      /**
       * imageUrl === null
       * → 기존 이미지 참조 제거
       */
      if (input.imageUrl === null) {
        await profileRepository.updateProfile(
          user.id,
          {
            imageUrl: null,
          },
          tx,
        );
      }

      /**
       * 새 temp 이미지가 정상적으로 final 처리된 경우
       * DB에는 최종 Key만 저장한다.
       */
      if (finalizedImageKey !== undefined) {
        await profileRepository.updateProfile(
          user.id,
          {
            imageUrl: finalizedImageKey,
          },
          tx,
        );
      }

      /**
       * regionIds가 전달되면 기존 값을 모두 삭제하고
       * 새로운 지역 목록으로 교체한다.
       */
      if (input.regionIds !== undefined) {
        await profileRepository.replaceServiceAreas(existingProfile.id, input.regionIds, tx);
      }

      /**
       * serviceTypes가 전달되면 기존 값을 모두 삭제하고
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
     * 새 final 객체를 보상 삭제한다.
     *
     * 기존 DB 데이터와 기존 이미지는 rollback에 의해 유지되고,
     * temp 객체는 Lifecycle 정리 대상으로 남긴다.
     */
    await rollbackFinalizedImageSafely(user.id, finalizedImageKey);

    throw error;
  }

  /**
   * -------------------------------
   * DB Transaction 성공 이후 S3 정리
   * -------------------------------
   *
   * 여기서 발생하는 S3 삭제 실패는 이미 성공한
   * 프로필 DB 변경을 되돌리지 않는다.
   */

  if (tempImageKey !== undefined) {
    /**
     * 새 이미지가 정상적으로 DB에 반영되었으므로
     * temp 객체를 삭제한다.
     *
     * 삭제 실패 시 Lifecycle이 최종 정리한다.
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
     * 이전 프로필 이미지는 DB에서 더 이상 참조하지 않으므로
     * S3 객체를 삭제한다.
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
