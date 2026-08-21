import "../../test/profile-image-test-env.js";

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { MoveType, Prisma, UserRole } from "@prisma/client";

import logger from "../../config/logger.js";
import { AppError } from "../../lib/app-error.js";
import { prisma } from "../../lib/prisma.js";
import { profileRepository } from "./customer/profile.repository.js";
import { profileService } from "./customer/profile.service.js";
import { profileImageService } from "./profile-image.service.js";
import {
  PROFILE_IMAGE_FINAL_KEY,
  PROFILE_IMAGE_LEGACY_FINAL_KEY,
  PROFILE_IMAGE_PREVIOUS_FINAL_KEY,
  PROFILE_IMAGE_TEMP_KEY,
  PROFILE_IMAGE_USER_ID,
  customerCreateInput,
  expectedProfileImageUrl,
} from "./profile-image.test-helpers.js";

type ImageCallState = {
  finalizeCalls: Array<{ userId: string; tempKey: string }>;
  deleteTempCalls: Array<{ userId: string; tempKey: string }>;
  deleteProfileCalls: Array<{ userId: string; key: string | null | undefined }>;
  createProfileImageUrls: string[];
  updateProfileImageUrls: Array<string | null | undefined>;
};

const user = {
  id: PROFILE_IMAGE_USER_ID,
  email: "customer@example.com",
  name: "고객",
  phone: "01012345678",
  role: UserRole.CUSTOMER,
  isActive: true,
  isProfileCompleted: false,
  deletedAt: null,
};

const createdProfile = {
  id: 1,
  userId: PROFILE_IMAGE_USER_ID,
  imageUrl: PROFILE_IMAGE_FINAL_KEY as string | null,
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

const existingProfile: typeof createdProfile = {
  ...createdProfile,
  imageUrl: PROFILE_IMAGE_PREVIOUS_FINAL_KEY,
};

const originalFindUserById = profileRepository.findUserById;
const originalFindProfileByUserId = profileRepository.findProfileByUserId;
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

function installBaseStubs(state: ImageCallState): void {
  profileRepository.findUserById = async () => user;
  profileRepository.findUserByPhoneExcludingUser = async () => null;
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
    if (input.imageUrl !== undefined) {
      state.createProfileImageUrls.push(input.imageUrl);
    }

    return {
      ...createdProfile,
      imageUrl: input.imageUrl ?? null,
    };
  };
}

function installUpdateSuccessStubs(state: ImageCallState): void {
  installBaseStubs(state);

  let currentProfile: typeof existingProfile = { ...existingProfile };

  profileRepository.findProfileByUserId = async () => currentProfile;
  profileRepository.updateProfile = async (_userId, data) => {
    state.updateProfileImageUrls.push(data.imageUrl);
    currentProfile = {
      ...currentProfile,
      imageUrl: data.imageUrl === undefined ? currentProfile.imageUrl : data.imageUrl,
    };
    return currentProfile;
  };
  profileRepository.replaceServiceAreas = async () => undefined;
  profileRepository.replaceServiceTypes = async () => undefined;
}

describe("customer profile createProfile image policy (unit)", () => {
  it("stores final key only, deletes temp after DB success, and returns mapped response", async () => {
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
    installCreateSuccessStubs(state);

    const response = await profileService.createProfile(PROFILE_IMAGE_USER_ID, {
      ...customerCreateInput,
      imageUrl: PROFILE_IMAGE_TEMP_KEY,
    });

    assert.deepEqual(state.finalizeCalls, [
      { userId: PROFILE_IMAGE_USER_ID, tempKey: PROFILE_IMAGE_TEMP_KEY },
    ]);
    assert.deepEqual(state.createProfileImageUrls, [PROFILE_IMAGE_FINAL_KEY]);
    assert.notEqual(state.createProfileImageUrls[0]?.startsWith("temp/"), true);
    assert.deepEqual(state.deleteTempCalls, [
      { userId: PROFILE_IMAGE_USER_ID, tempKey: PROFILE_IMAGE_TEMP_KEY },
    ]);
    assert.equal(state.deleteProfileCalls.length, 0);
    assert.equal(response.imageUrl, expectedProfileImageUrl(PROFILE_IMAGE_FINAL_KEY));
  });

  it("does not call finalize or delete when creating a profile without an image", async () => {
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
    installCreateSuccessStubs(state);
    profileRepository.createProfile = async (_userId, input) => ({
      ...createdProfile,
      imageUrl: input.imageUrl ?? null,
    });

    await profileService.createProfile(PROFILE_IMAGE_USER_ID, customerCreateInput);

    assert.equal(state.finalizeCalls.length, 0);
    assert.equal(state.deleteTempCalls.length, 0);
    assert.equal(state.deleteProfileCalls.length, 0);
    assert.equal(state.createProfileImageUrls.length, 0);
  });

  it("rolls back new final image on DB transaction failure and does not delete temp immediately", async () => {
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
    installCreateSuccessStubs(state);

    prisma.$transaction = (async () => {
      throw new Prisma.PrismaClientKnownRequestError("duplicate userId", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["userId"] },
      });
    }) as unknown as typeof prisma.$transaction;

    await assert.rejects(
      () =>
        profileService.createProfile(PROFILE_IMAGE_USER_ID, {
          ...customerCreateInput,
          imageUrl: PROFILE_IMAGE_TEMP_KEY,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "CONFLICT" &&
        error.message === "이미 등록된 프로필 정보입니다.",
    );

    assert.deepEqual(state.deleteProfileCalls, [
      { userId: PROFILE_IMAGE_USER_ID, key: PROFILE_IMAGE_FINAL_KEY },
    ]);
    assert.equal(state.deleteTempCalls.length, 0);
  });

  it("keeps profile creation successful when temp delete fails after DB success", async () => {
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
    installCreateSuccessStubs(state);

    const errorLogs: unknown[] = [];
    logger.error = ((...args: unknown[]) => {
      errorLogs.push(args);
    }) as typeof logger.error;

    profileImageService.deleteTemporaryImage = async (userId, tempKey) => {
      state.deleteTempCalls.push({ userId, tempKey });
      throw new Error("temp delete failed");
    };

    const response = await profileService.createProfile(PROFILE_IMAGE_USER_ID, {
      ...customerCreateInput,
      imageUrl: PROFILE_IMAGE_TEMP_KEY,
    });

    assert.equal(response.imageUrl, expectedProfileImageUrl(PROFILE_IMAGE_FINAL_KEY));
    assert.equal(state.deleteProfileCalls.length, 0);
    assert.equal(errorLogs.length, 1);
  });

  it("does not roll back final image when post-transaction hasPassword lookup fails", async () => {
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
    installCreateSuccessStubs(state);
    profileRepository.hasPasswordByUserId = async () => {
      throw new Error("hasPassword lookup failed");
    };

    await assert.rejects(
      () =>
        profileService.createProfile(PROFILE_IMAGE_USER_ID, {
          ...customerCreateInput,
          imageUrl: PROFILE_IMAGE_TEMP_KEY,
        }),
      (error: unknown) => error instanceof Error && error.message === "hasPassword lookup failed",
    );

    assert.equal(state.deleteProfileCalls.length, 0);
    assert.deepEqual(state.deleteTempCalls, [
      { userId: PROFILE_IMAGE_USER_ID, tempKey: PROFILE_IMAGE_TEMP_KEY },
    ]);
  });

  it("keeps phone duplicate policy on create failure after finalize", async () => {
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
    installCreateSuccessStubs(state);

    prisma.$transaction = (async () => {
      throw new Prisma.PrismaClientKnownRequestError("duplicate phone", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["phone"] },
      });
    }) as unknown as typeof prisma.$transaction;

    await assert.rejects(
      () =>
        profileService.createProfile(PROFILE_IMAGE_USER_ID, {
          ...customerCreateInput,
          imageUrl: PROFILE_IMAGE_TEMP_KEY,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "CONFLICT" &&
        error.message === "이미 사용 중인 전화번호입니다.",
    );

    assert.deepEqual(state.deleteProfileCalls, [
      { userId: PROFILE_IMAGE_USER_ID, key: PROFILE_IMAGE_FINAL_KEY },
    ]);
  });
});

describe("customer profile updateProfile image policy (unit)", () => {
  it("keeps existing image and skips S3 calls when imageUrl is undefined", async () => {
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
    installUpdateSuccessStubs(state);

    const response = await profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
      serviceTypes: [MoveType.OFFICE],
    });

    assert.equal(state.finalizeCalls.length, 0);
    assert.equal(state.deleteTempCalls.length, 0);
    assert.equal(state.deleteProfileCalls.length, 0);
    assert.equal(state.updateProfileImageUrls.length, 0);
    assert.equal(response.imageUrl, expectedProfileImageUrl(PROFILE_IMAGE_PREVIOUS_FINAL_KEY));
  });

  it("sets DB imageUrl to null and deletes previous final image after DB success", async () => {
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
    installUpdateSuccessStubs(state);

    const response = await profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
      imageUrl: null,
    });

    assert.deepEqual(state.updateProfileImageUrls, [null]);
    assert.equal(state.finalizeCalls.length, 0);
    assert.deepEqual(state.deleteProfileCalls, [
      {
        userId: PROFILE_IMAGE_USER_ID,
        key: PROFILE_IMAGE_PREVIOUS_FINAL_KEY,
      },
    ]);
    assert.equal(response.imageUrl, null);
  });

  it("promotes temp to final, stores final key, and deletes temp plus previous image", async () => {
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
    installUpdateSuccessStubs(state);

    await profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
      imageUrl: PROFILE_IMAGE_TEMP_KEY,
    });

    assert.deepEqual(state.finalizeCalls, [
      { userId: PROFILE_IMAGE_USER_ID, tempKey: PROFILE_IMAGE_TEMP_KEY },
    ]);
    assert.deepEqual(state.updateProfileImageUrls, [PROFILE_IMAGE_FINAL_KEY]);
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
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
    installUpdateSuccessStubs(state);

    prisma.$transaction = (async () => {
      throw new Error("update transaction failed");
    }) as unknown as typeof prisma.$transaction;

    await assert.rejects(
      () =>
        profileService.updateProfile(PROFILE_IMAGE_USER_ID, {
          imageUrl: PROFILE_IMAGE_TEMP_KEY,
        }),
      (error: unknown) => error instanceof Error && error.message === "update transaction failed",
    );

    assert.deepEqual(state.deleteProfileCalls, [
      { userId: PROFILE_IMAGE_USER_ID, key: PROFILE_IMAGE_FINAL_KEY },
    ]);
    assert.equal(state.deleteTempCalls.length, 0);
    assert.equal(state.updateProfileImageUrls.length, 0);
  });

  it("keeps profile update successful when previous image delete fails", async () => {
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
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
});

describe("customer profile imageUrl mapping regression (unit)", () => {
  it("maps legacy profiles/{userId}/ DB keys through CloudFront", async () => {
    const state: ImageCallState = {
      finalizeCalls: [],
      deleteTempCalls: [],
      deleteProfileCalls: [],
      createProfileImageUrls: [],
      updateProfileImageUrls: [],
    };
    installBaseStubs(state);
    profileRepository.findProfileByUserId = async () => ({
      ...existingProfile,
      imageUrl: PROFILE_IMAGE_LEGACY_FINAL_KEY,
    });

    const response = await profileService.getMyProfile(PROFILE_IMAGE_USER_ID);

    assert.equal(response.imageUrl, expectedProfileImageUrl(PROFILE_IMAGE_LEGACY_FINAL_KEY));
  });
});
