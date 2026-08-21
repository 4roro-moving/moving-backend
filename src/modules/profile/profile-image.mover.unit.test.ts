import "../../test/profile-image-test-env.js";

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { MoveType, Prisma, UserRole } from "@prisma/client";

import logger from "../../config/logger.js";
import { AppError } from "../../lib/app-error.js";
import { prisma } from "../../lib/prisma.js";
import { profileRepository } from "./mover/profile.repository.js";
import { profileService } from "./mover/profile.service.js";
import { profileImageService } from "./profile-image.service.js";
import {
  PROFILE_IMAGE_FINAL_KEY,
  PROFILE_IMAGE_PREVIOUS_FINAL_KEY,
  PROFILE_IMAGE_TEMP_KEY,
  PROFILE_IMAGE_USER_ID,
  moverCreateInput,
  expectedProfileImageUrl,
} from "./profile-image.test-helpers.js";

type ImageCallState = {
  finalizeCalls: Array<{ userId: string; tempKey: string }>;
  deleteTempCalls: Array<{ userId: string; tempKey: string }>;
  deleteProfileCalls: Array<{ userId: string; key: string | null | undefined }>;
  createProfileInputs: Array<Record<string, unknown>>;
  updateProfileInputs: Array<Record<string, unknown>>;
  replaceRegionCalls: number;
  replaceServiceTypeCalls: number;
};

const user = {
  id: PROFILE_IMAGE_USER_ID,
  email: "mover@example.com",
  name: "기사",
  phone: "01012345678",
  role: UserRole.MOVER,
  isActive: true,
  isProfileCompleted: false,
  deletedAt: null,
};

const baseProfile = {
  id: 1,
  userId: PROFILE_IMAGE_USER_ID,
  nickname: moverCreateInput.nickname,
  imageUrl: PROFILE_IMAGE_FINAL_KEY as string | null,
  career: moverCreateInput.career,
  shortIntro: moverCreateInput.shortIntro,
  description: moverCreateInput.description,
  activityBaseAddress: moverCreateInput.activityBase.address,
  activityBaseDetailAddress: moverCreateInput.activityBase.detailAddress ?? null,
  activityBaseZipCode: moverCreateInput.activityBase.zipCode,
  activityBaseLatitude: new Prisma.Decimal(moverCreateInput.activityBase.latitude),
  activityBaseLongitude: new Prisma.Decimal(moverCreateInput.activityBase.longitude),
  confirmedCount: 0,
  averageRating: new Prisma.Decimal(0),
  reviewCount: 0,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  user: {
    name: user.name,
    email: user.email,
    phone: user.phone,
  },
  serviceAreas: [],
  serviceTypes: [],
};

const existingProfile: typeof baseProfile = {
  ...baseProfile,
  imageUrl: PROFILE_IMAGE_PREVIOUS_FINAL_KEY,
};

const originalFindUserById = profileRepository.findUserById;
const originalFindProfileByUserId = profileRepository.findProfileByUserId;
const originalFindProfileByNickname = profileRepository.findProfileByNickname;
const originalFindProfileByNicknameExcludingUser =
  profileRepository.findProfileByNicknameExcludingUser;
const originalFindUserByPhoneExcludingUser = profileRepository.findUserByPhoneExcludingUser;
const originalCountRegionsByIds = profileRepository.countRegionsByIds;
const originalCreateProfile = profileRepository.createProfile;
const originalUpdateProfile = profileRepository.updateProfile;
const originalReplaceServiceAreas = profileRepository.replaceServiceAreas;
const originalReplaceServiceTypes = profileRepository.replaceServiceTypes;
const originalMarkProfileCompleted = profileRepository.markProfileCompleted;
const originalHasPasswordByUserId = profileRepository.hasPasswordByUserId;
const originalFinalizeUploadedImage = profileImageService.finalizeUploadedImage;
const originalDeleteTemporaryImage = profileImageService.deleteTemporaryImage;
const originalDeleteProfileImage = profileImageService.deleteProfileImage;
const originalTransaction = prisma.$transaction;
const originalLoggerError = logger.error;

function restoreStubs(): void {
  profileRepository.findUserById = originalFindUserById;
  profileRepository.findProfileByUserId = originalFindProfileByUserId;
  profileRepository.findProfileByNickname = originalFindProfileByNickname;
  profileRepository.findProfileByNicknameExcludingUser = originalFindProfileByNicknameExcludingUser;
  profileRepository.findUserByPhoneExcludingUser = originalFindUserByPhoneExcludingUser;
  profileRepository.countRegionsByIds = originalCountRegionsByIds;
  profileRepository.createProfile = originalCreateProfile;
  profileRepository.updateProfile = originalUpdateProfile;
  profileRepository.replaceServiceAreas = originalReplaceServiceAreas;
  profileRepository.replaceServiceTypes = originalReplaceServiceTypes;
  profileRepository.markProfileCompleted = originalMarkProfileCompleted;
  profileRepository.hasPasswordByUserId = originalHasPasswordByUserId;
  profileImageService.finalizeUploadedImage = originalFinalizeUploadedImage;
  profileImageService.deleteTemporaryImage = originalDeleteTemporaryImage;
  profileImageService.deleteProfileImage = originalDeleteProfileImage;
  prisma.$transaction = originalTransaction;
  logger.error = originalLoggerError;
}

afterEach(() => {
  restoreStubs();
});

function createEmptyState(): ImageCallState {
  return {
    finalizeCalls: [],
    deleteTempCalls: [],
    deleteProfileCalls: [],
    createProfileInputs: [],
    updateProfileInputs: [],
    replaceRegionCalls: 0,
    replaceServiceTypeCalls: 0,
  };
}

function installBaseStubs(state: ImageCallState): void {
  profileRepository.findUserById = async () => user;
  profileRepository.findUserByPhoneExcludingUser = async () => null;
  profileRepository.findProfileByNickname = async () => null;
  profileRepository.findProfileByNicknameExcludingUser = async () => null;
  profileRepository.countRegionsByIds = async (regionIds) => regionIds.length;
  profileRepository.hasPasswordByUserId = async () => true;
  profileRepository.markProfileCompleted = async () =>
    ({
      ...user,
      password: null,
      authProvider: "LOCAL",
      providerUserId: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      isProfileCompleted: true,
    }) as Awaited<ReturnType<typeof profileRepository.markProfileCompleted>>;

  profileImageService.finalizeUploadedImage = async (userId, tempKey) => {
    state.finalizeCalls.push({ userId, tempKey });
    return PROFILE_IMAGE_FINAL_KEY;
  };

  profileImageService.deleteTemporaryImage = async (userId, tempKey) => {
    state.deleteTempCalls.push({ userId, tempKey });
  };

  profileImageService.deleteProfileImage = async (userId, key) => {
    state.deleteProfileCalls.push({ userId, key });
  };

  prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
    callback({} as never)) as unknown as typeof prisma.$transaction;
}

function installCreateSuccessStubs(state: ImageCallState): void {
  installBaseStubs(state);
  profileRepository.findProfileByUserId = async () => null;
  profileRepository.createProfile = async (_userId, input) => {
    state.createProfileInputs.push(input as unknown as Record<string, unknown>);
    return {
      ...baseProfile,
      imageUrl: input.imageUrl ?? null,
    };
  };
}

function installUpdateSuccessStubs(state: ImageCallState): void {
  installBaseStubs(state);

  let currentProfile = { ...existingProfile };

  profileRepository.findProfileByUserId = async () =>
    currentProfile as NonNullable<
      Awaited<ReturnType<typeof profileRepository.findProfileByUserId>>
    >;
  profileRepository.updateProfile = async (_userId, data) => {
    state.updateProfileInputs.push(data as Record<string, unknown>);
    currentProfile = {
      ...currentProfile,
      ...(data.nickname !== undefined && { nickname: data.nickname }),
      ...(data.career !== undefined && { career: data.career }),
      ...(data.shortIntro !== undefined && { shortIntro: data.shortIntro }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.activityBaseAddress !== undefined && {
        activityBaseAddress: data.activityBaseAddress,
      }),
      ...(data.activityBaseDetailAddress !== undefined && {
        activityBaseDetailAddress: data.activityBaseDetailAddress,
      }),
      ...(data.activityBaseZipCode !== undefined && {
        activityBaseZipCode: data.activityBaseZipCode,
      }),
      ...(data.activityBaseLatitude !== undefined && {
        activityBaseLatitude: new Prisma.Decimal(data.activityBaseLatitude),
      }),
      ...(data.activityBaseLongitude !== undefined && {
        activityBaseLongitude: new Prisma.Decimal(data.activityBaseLongitude),
      }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
    } as typeof existingProfile;
    return currentProfile as NonNullable<
      Awaited<ReturnType<typeof profileRepository.findProfileByUserId>>
    >;
  };
  profileRepository.replaceServiceAreas = async () => {
    state.replaceRegionCalls += 1;
  };
  profileRepository.replaceServiceTypes = async () => {
    state.replaceServiceTypeCalls += 1;
  };
}

describe("mover profile createProfile image policy (unit)", () => {
  it("stores final key only and deletes temp after DB success while preserving mover fields", async () => {
    const state = createEmptyState();
    installCreateSuccessStubs(state);

    const response = await profileService.createProfile(PROFILE_IMAGE_USER_ID, {
      ...moverCreateInput,
      imageUrl: PROFILE_IMAGE_TEMP_KEY,
    });

    assert.deepEqual(state.finalizeCalls, [
      { userId: PROFILE_IMAGE_USER_ID, tempKey: PROFILE_IMAGE_TEMP_KEY },
    ]);
    assert.equal(state.createProfileInputs[0]?.imageUrl, PROFILE_IMAGE_FINAL_KEY);
    assert.equal(state.createProfileInputs[0]?.nickname, moverCreateInput.nickname);
    assert.equal(state.createProfileInputs[0]?.career, moverCreateInput.career);
    assert.deepEqual(state.deleteTempCalls, [
      { userId: PROFILE_IMAGE_USER_ID, tempKey: PROFILE_IMAGE_TEMP_KEY },
    ]);
    assert.equal(response.nickname, moverCreateInput.nickname);
    assert.equal(response.imageUrl, expectedProfileImageUrl(PROFILE_IMAGE_FINAL_KEY));
  });

  it("rolls back new final image on DB transaction failure", async () => {
    const state = createEmptyState();
    installCreateSuccessStubs(state);

    prisma.$transaction = (async () => {
      throw new Prisma.PrismaClientKnownRequestError("duplicate nickname", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["nickname"] },
      });
    }) as unknown as typeof prisma.$transaction;

    await assert.rejects(
      () =>
        profileService.createProfile(PROFILE_IMAGE_USER_ID, {
          ...moverCreateInput,
          imageUrl: PROFILE_IMAGE_TEMP_KEY,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "CONFLICT" &&
        error.message === "이미 사용 중인 닉네임입니다.",
    );

    assert.deepEqual(state.deleteProfileCalls, [
      { userId: PROFILE_IMAGE_USER_ID, key: PROFILE_IMAGE_FINAL_KEY },
    ]);
    assert.equal(state.deleteTempCalls.length, 0);
  });
});

describe("mover profile updateProfile image policy (unit)", () => {
  it("keeps existing image when imageUrl is undefined", async () => {
    const state = createEmptyState();
    installUpdateSuccessStubs(state);

    const response = await profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
      nickname: "새닉네임",
    });

    assert.equal(state.finalizeCalls.length, 0);
    assert.equal(state.deleteTempCalls.length, 0);
    assert.equal(state.deleteProfileCalls.length, 0);
    assert.equal(response.nickname, "새닉네임");
    assert.equal(response.imageUrl, expectedProfileImageUrl(PROFILE_IMAGE_PREVIOUS_FINAL_KEY));
  });

  it("sets DB imageUrl to null and deletes previous final image after DB success", async () => {
    const state = createEmptyState();
    installUpdateSuccessStubs(state);

    const response = await profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
      imageUrl: null,
    });

    assert.equal(state.updateProfileInputs[0]?.imageUrl, null);
    assert.deepEqual(state.deleteProfileCalls, [
      {
        userId: PROFILE_IMAGE_USER_ID,
        key: PROFILE_IMAGE_PREVIOUS_FINAL_KEY,
      },
    ]);
    assert.equal(response.imageUrl, null);
  });

  it("promotes temp to final and deletes temp plus previous image", async () => {
    const state = createEmptyState();
    installUpdateSuccessStubs(state);

    await profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
      imageUrl: PROFILE_IMAGE_TEMP_KEY,
      shortIntro: "업데이트된 한줄소개",
    });

    assert.deepEqual(state.updateProfileInputs[0], {
      imageUrl: PROFILE_IMAGE_FINAL_KEY,
      shortIntro: "업데이트된 한줄소개",
    });
    assert.deepEqual(state.deleteTempCalls, [
      { userId: PROFILE_IMAGE_USER_ID, tempKey: PROFILE_IMAGE_TEMP_KEY },
    ]);
    assert.deepEqual(state.deleteProfileCalls, [
      {
        userId: PROFILE_IMAGE_USER_ID,
        key: PROFILE_IMAGE_PREVIOUS_FINAL_KEY,
      },
    ]);
  });

  it("rolls back new final image on update transaction failure without deleting previous image", async () => {
    const state = createEmptyState();
    installUpdateSuccessStubs(state);

    prisma.$transaction = (async () => {
      throw new Error("mover update transaction failed");
    }) as unknown as typeof prisma.$transaction;

    await assert.rejects(
      () =>
        profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
          imageUrl: PROFILE_IMAGE_TEMP_KEY,
        }),
      (error: unknown) =>
        error instanceof Error && error.message === "mover update transaction failed",
    );

    assert.deepEqual(state.deleteProfileCalls, [
      { userId: PROFILE_IMAGE_USER_ID, key: PROFILE_IMAGE_FINAL_KEY },
    ]);
    assert.equal(state.deleteTempCalls.length, 0);
  });

  it("keeps profile update successful when previous image delete fails", async () => {
    const state = createEmptyState();
    installUpdateSuccessStubs(state);

    const errorLogs: unknown[] = [];
    logger.error = ((...args: unknown[]) => {
      errorLogs.push(args);
    }) as typeof logger.error;

    profileImageService.deleteProfileImage = async (userId, key) => {
      state.deleteProfileCalls.push({ userId, key });
      throw new Error("previous delete failed");
    };

    const response = await profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
      imageUrl: PROFILE_IMAGE_TEMP_KEY,
    });

    assert.equal(response.imageUrl, expectedProfileImageUrl(PROFILE_IMAGE_FINAL_KEY));
    assert.equal(errorLogs.length, 1);
  });

  it("rolls back new final image when activityBase update fails inside the transaction", async () => {
    const state = createEmptyState();
    installUpdateSuccessStubs(state);

    profileRepository.updateProfile = async (_userId, data) => {
      state.updateProfileInputs.push(data as Record<string, unknown>);
      throw new Error("activityBase update failed");
    };

    await assert.rejects(
      () =>
        profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
          imageUrl: PROFILE_IMAGE_TEMP_KEY,
          activityBase: moverCreateInput.activityBase,
        }),
      (error: unknown) => error instanceof Error && error.message === "activityBase update failed",
    );

    assert.deepEqual(state.deleteProfileCalls, [
      { userId: PROFILE_IMAGE_USER_ID, key: PROFILE_IMAGE_FINAL_KEY },
    ]);
  });

  it("rolls back new final image when regionIds replacement fails inside the transaction", async () => {
    const state = createEmptyState();
    installUpdateSuccessStubs(state);

    profileRepository.replaceServiceAreas = async () => {
      state.replaceRegionCalls += 1;
      throw new Error("region replace failed");
    };

    await assert.rejects(
      () =>
        profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
          imageUrl: PROFILE_IMAGE_TEMP_KEY,
          regionIds: [1, 2],
        }),
      (error: unknown) => error instanceof Error && error.message === "region replace failed",
    );

    assert.deepEqual(state.deleteProfileCalls, [
      { userId: PROFILE_IMAGE_USER_ID, key: PROFILE_IMAGE_FINAL_KEY },
    ]);
    assert.equal(state.replaceRegionCalls, 1);
  });

  it("rolls back new final image when serviceTypes replacement fails inside the transaction", async () => {
    const state = createEmptyState();
    installUpdateSuccessStubs(state);

    profileRepository.replaceServiceTypes = async () => {
      state.replaceServiceTypeCalls += 1;
      throw new Error("serviceTypes replace failed");
    };

    await assert.rejects(
      () =>
        profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
          imageUrl: PROFILE_IMAGE_TEMP_KEY,
          serviceTypes: [MoveType.OFFICE],
        }),
      (error: unknown) => error instanceof Error && error.message === "serviceTypes replace failed",
    );

    assert.deepEqual(state.deleteProfileCalls, [
      { userId: PROFILE_IMAGE_USER_ID, key: PROFILE_IMAGE_FINAL_KEY },
    ]);
    assert.equal(state.replaceServiceTypeCalls, 1);
  });

  it("keeps nickname duplicate policy during image replacement", async () => {
    const state = createEmptyState();
    installUpdateSuccessStubs(state);
    profileRepository.findProfileByNicknameExcludingUser = async () => ({
      ...existingProfile,
      userId: "other-mover",
    });

    await assert.rejects(
      () =>
        profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
          imageUrl: PROFILE_IMAGE_TEMP_KEY,
          nickname: "중복닉네임",
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "CONFLICT" &&
        error.message === "이미 사용 중인 닉네임입니다.",
    );

    assert.equal(state.finalizeCalls.length, 0);
    assert.equal(state.deleteProfileCalls.length, 0);
  });
});

describe("mover profile field preservation with image replacement (unit)", () => {
  it("updates career, description, and activityBase together with a new image", async () => {
    const state = createEmptyState();
    installUpdateSuccessStubs(state);

    const response = await profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
      imageUrl: PROFILE_IMAGE_TEMP_KEY,
      career: 10,
      description: "새 상세 소개",
      activityBase: {
        address: "부산광역시 해운대구",
        zipCode: "48094",
        latitude: 35.158,
        longitude: 129.16,
      },
    });

    assert.equal(state.updateProfileInputs[0]?.career, 10);
    assert.equal(state.updateProfileInputs[0]?.description, "새 상세 소개");
    assert.equal(state.updateProfileInputs[0]?.activityBaseAddress, "부산광역시 해운대구");
    assert.equal(response.career, 10);
    assert.equal(response.description, "새 상세 소개");
    assert.deepEqual(response.activityBase, {
      address: "부산광역시 해운대구",
      zipCode: "48094",
      latitude: 35.158,
      longitude: 129.16,
    });
  });
});
