import "../../test/profile-image-test-env.js";

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import logger from "../../config/logger.js";
import { profileImageService } from "./profile-image.service.js";
import { cleanupImageSafely, rollbackFinalizedImageSafely } from "./profile-image.cleanup.js";
import { PROFILE_IMAGE_FINAL_KEY, PROFILE_IMAGE_USER_ID } from "./profile-image.test-helpers.js";

const originalDeleteProfileImage = profileImageService.deleteProfileImage;
const originalDeleteTemporaryImage = profileImageService.deleteTemporaryImage;
const originalLoggerError = logger.error;

afterEach(() => {
  profileImageService.deleteProfileImage = originalDeleteProfileImage;
  profileImageService.deleteTemporaryImage = originalDeleteTemporaryImage;
  logger.error = originalLoggerError;
});

describe("cleanupImageSafely (post-commit S3 cleanup)", () => {
  it("completes without throwing when cleanup succeeds", async () => {
    profileImageService.deleteTemporaryImage = async () => {};

    await assert.doesNotReject(() =>
      cleanupImageSafely(
        () =>
          profileImageService.deleteTemporaryImage(
            PROFILE_IMAGE_USER_ID,
            "temp/profiles/user/temp.jpg",
          ),
        {
          userId: PROFILE_IMAGE_USER_ID,
          key: "temp/profiles/user/temp.jpg",
          action: "DELETE_TEMP_IMAGE",
        },
      ),
    );
  });

  it("does not throw and logs when cleanup fails", async () => {
    const errorLogs: unknown[] = [];
    logger.error = ((...args: unknown[]) => {
      errorLogs.push(args);
    }) as typeof logger.error;

    profileImageService.deleteTemporaryImage = async () => {
      throw new Error("delete failed");
    };

    await assert.doesNotReject(() =>
      cleanupImageSafely(
        () =>
          profileImageService.deleteTemporaryImage(
            PROFILE_IMAGE_USER_ID,
            "temp/profiles/user/temp.jpg",
          ),
        {
          userId: PROFILE_IMAGE_USER_ID,
          key: "temp/profiles/user/temp.jpg",
          action: "DELETE_TEMP_IMAGE",
        },
      ),
    );

    assert.equal(errorLogs.length, 1);
  });
});

describe("rollbackFinalizedImageSafely (compensating delete on DB tx failure)", () => {
  it("does not call deleteProfileImage when finalKey is undefined", async () => {
    let deleteCalls = 0;
    profileImageService.deleteProfileImage = async () => {
      deleteCalls += 1;
    };

    await rollbackFinalizedImageSafely(PROFILE_IMAGE_USER_ID, undefined);

    assert.equal(deleteCalls, 0);
  });

  it("calls deleteProfileImage when finalKey exists", async () => {
    const deletedKeys: string[] = [];
    profileImageService.deleteProfileImage = async (_userId, key) => {
      deletedKeys.push(key ?? "");
    };

    await rollbackFinalizedImageSafely(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_FINAL_KEY);

    assert.deepEqual(deletedKeys, [PROFILE_IMAGE_FINAL_KEY]);
  });

  it("does not throw when compensating delete fails", async () => {
    const errorLogs: unknown[] = [];
    logger.error = ((...args: unknown[]) => {
      errorLogs.push(args);
    }) as typeof logger.error;

    profileImageService.deleteProfileImage = async () => {
      throw new Error("rollback delete failed");
    };

    await assert.doesNotReject(() =>
      rollbackFinalizedImageSafely(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_FINAL_KEY),
    );

    assert.equal(errorLogs.length, 1);
  });
});
