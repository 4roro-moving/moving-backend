import bcrypt from "bcrypt";
import { RefreshTokenSessionType } from "@prisma/client";

import { authRepository } from "../../auth/auth.repository";
import { AppError } from "../../../lib/app-error";
import { runTransaction } from "../../../utils/transaction";

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

/*
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

/*
 * 고객 프로필을 생성한다.
 *
 * 기존 User.phone이 없는 경우 프로필 생성 요청의
 * phone을 필수로 검증한 뒤 User 테이블에 함께 저장한다.
 */
const createProfile = async (
  userId: string,
  input: CreateProfileInput,
): Promise<ProfileResponse> => {
  const user = assertActiveCustomer(await profileRepository.findUserById(userId));

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

  /*
   * phone은 User 테이블의 필드이므로
   * CustomerProfile 생성 데이터와 분리한다.
   */
  const profileInput = {
    ...(input.imageUrl !== undefined && {
      imageUrl: input.imageUrl,
    }),

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
};

/*
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

/*
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

/*
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

  /*
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
    /*
     * 비밀번호 변경 요청 시 세 필드를 모두 전달해야 한다.
     *
     * Validator에서도 확인하지만 Service 직접 호출에 대비해
     * 비즈니스 규칙을 다시 검증한다.
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

    /*
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

    /*
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

      /*
       * 비밀번호가 실제로 변경된 경우
       * 해당 사용자의 기존 USER Refresh Token 세션을
       * 모두 폐기한다.
       *
       * password UPDATE와 세션 revoke를 동일한
       * 트랜잭션으로 묶어 둘 중 하나만 반영되는
       * 상태를 방지한다.
       */
      if (hashedPassword !== undefined) {
        await authRepository.revokeAllRefreshTokensByUserId(
          user.id,
          RefreshTokenSessionType.USER,
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

/*
 * 현재 로그인한 고객의 프로필 정보를 수정한다.
 *
 * CustomerProfile 테이블:
 * - imageUrl
 *
 * 관계 테이블:
 * - serviceAreas
 * - serviceTypes
 */
const updateProfile = async (
  userId: string,
  input: UpdateProfileInput,
): Promise<ProfileResponse> => {
  const user = assertActiveCustomer(await profileRepository.findUserById(userId));

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

  if (input.regionIds !== undefined) {
    await validateRegions(input.regionIds);
  }

  return runTransaction(async (tx) => {
    /*
     * imageUrl:
     * - undefined: 이미지 수정 없음
     * - null: 기존 이미지 삭제
     * - string: 새 이미지 Key로 변경
     */
    if (input.imageUrl !== undefined) {
      await profileRepository.updateProfile(
        user.id,
        {
          imageUrl: input.imageUrl,
        },
        tx,
      );
    }

    /*
     * 지역 정보가 전달되면 기존 값을 모두 삭제하고
     * 새로운 지역 목록으로 교체한다.
     */
    if (input.regionIds !== undefined) {
      await profileRepository.replaceServiceAreas(existingProfile.id, input.regionIds, tx);
    }

    /*
     * 서비스 유형이 전달되면 기존 값을 모두 삭제하고
     * 새로운 서비스 유형 목록으로 교체한다.
     */
    if (input.serviceTypes !== undefined) {
      await profileRepository.replaceServiceTypes(existingProfile.id, input.serviceTypes, tx);
    }

    const updatedProfile = await profileRepository.findProfileByUserId(user.id, tx);

    if (!updatedProfile) {
      throw new AppError("NOT_FOUND", {
        message: "수정된 프로필을 찾을 수 없습니다.",
      });
    }

    return mapProfileResponse(updatedProfile, await profileRepository.hasPasswordByUserId(user.id));
  });
};

export const profileService = {
  createProfile,
  getMyProfile,
  getProfileStatus,
  updateBasicInfo,
  updateProfile,
};
