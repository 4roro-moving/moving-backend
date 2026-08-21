import "../../test/profile-image-test-env.js";

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";

import { AppError } from "../../lib/app-error.js";
import { s3Client } from "../../lib/s3.js";
import {
  PROFILE_IMAGE_FINAL_KEY,
  PROFILE_IMAGE_TEMP_KEY,
  PROFILE_IMAGE_USER_ID,
  assertFinalKeyFormat,
  assertTempKeyFormat,
} from "./profile-image.test-helpers.js";

const OTHER_USER_TEMP_KEY = "temp/profiles/other-user/image-id.jpg";

type PresignCapture = {
  command?: PutObjectCommand;
  options?: { expiresIn?: number };
};

let presignCapture: PresignCapture = {};

mock.module("@aws-sdk/s3-request-presigner", {
  namedExports: {
    getSignedUrl: mock.fn(async (_client, command, options) => {
      presignCapture = {
        command: command as PutObjectCommand,
        options: options as { expiresIn?: number },
      };

      return "https://example.com/presigned-upload";
    }),
  },
});

const { profileImageService } = await import("./profile-image.service.js");

let sendCalls: unknown[] = [];
let originalSend: typeof s3Client.send;

function installS3SendStub(handler: (command: unknown) => Promise<unknown> | unknown): void {
  s3Client.send = (async (command: unknown) => handler(command)) as typeof s3Client.send;
}

function installDefaultHeadObjectSuccess(contentType = "image/jpeg", contentLength = 1024): void {
  installS3SendStub(async (command) => {
    sendCalls.push(command);

    if (command instanceof HeadObjectCommand) {
      return {
        ContentType: contentType,
        ContentLength: contentLength,
      };
    }

    if (command instanceof CopyObjectCommand) {
      return {};
    }

    if (command instanceof DeleteObjectCommand) {
      return {};
    }

    throw new Error(`Unexpected S3 command: ${String(command)}`);
  });
}

beforeEach(() => {
  sendCalls = [];
  presignCapture = {};
  originalSend = s3Client.send.bind(s3Client);
});

afterEach(() => {
  s3Client.send = originalSend;
});

describe("profileImageService.createUploadUrl (presigned temp upload)", () => {
  it("returns temp/profiles/{userId}/ key with allowed extension and expiresIn 180", async () => {
    const result = await profileImageService.createUploadUrl(PROFILE_IMAGE_USER_ID, {
      contentType: "image/jpeg",
      size: 1024,
    });

    assert.match(result.uploadUrl, /^https:\/\/example.com\/presigned-upload$/);
    assertTempKeyFormat(result.key, PROFILE_IMAGE_USER_ID);
    assert.equal(result.expiresIn, 180);
    assert.equal(presignCapture.options?.expiresIn, 180);

    const putCommand = presignCapture.command;
    assert.ok(putCommand instanceof PutObjectCommand);
    assert.equal(putCommand.input.Key, result.key);
    assert.equal(putCommand.input.ContentType, "image/jpeg");
    assert.match(putCommand.input.Key ?? "", /^temp\/profiles\//);
    assert.doesNotMatch(putCommand.input.Key ?? "", /^profiles\//);
  });

  it("uses png and webp extensions for allowed content types", async () => {
    const pngResult = await profileImageService.createUploadUrl(PROFILE_IMAGE_USER_ID, {
      contentType: "image/png",
      size: 1024,
    });
    assert.match(pngResult.key, /\.png$/);

    const webpResult = await profileImageService.createUploadUrl(PROFILE_IMAGE_USER_ID, {
      contentType: "image/webp",
      size: 1024,
    });
    assert.match(webpResult.key, /\.webp$/);
  });

  it("does not issue presigned URLs for final profiles/{userId}/ keys", async () => {
    const result = await profileImageService.createUploadUrl(PROFILE_IMAGE_USER_ID, {
      contentType: "image/jpeg",
      size: 1024,
    });

    assert.doesNotMatch(result.key, /^profiles\//);
    assert.match(result.key, /^temp\/profiles\//);
  });
});

describe("profileImageService.validateUploadedImage (temp object validation)", () => {
  it("allows the current user's temp key when HeadObject metadata is valid", async () => {
    installDefaultHeadObjectSuccess("image/jpeg", 1024);

    await assert.doesNotReject(() =>
      profileImageService.validateUploadedImage(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_TEMP_KEY),
    );

    assert.equal(sendCalls.length, 1);
    assert.ok(sendCalls[0] instanceof HeadObjectCommand);
  });

  it("returns FORBIDDEN for another user's temp key", async () => {
    installDefaultHeadObjectSuccess();

    await assert.rejects(
      () => profileImageService.validateUploadedImage(PROFILE_IMAGE_USER_ID, OTHER_USER_TEMP_KEY),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "FORBIDDEN" &&
        error.message === "본인의 프로필 이미지만 등록할 수 있습니다.",
    );

    assert.equal(sendCalls.length, 0);
  });

  it("returns BAD_REQUEST when the temp object does not exist", async () => {
    installS3SendStub(async (command) => {
      sendCalls.push(command);

      if (command instanceof HeadObjectCommand) {
        throw new S3ServiceException({
          name: "NotFound",
          $fault: "client",
          $metadata: { httpStatusCode: 404 },
        });
      }

      throw new Error("Unexpected command");
    });

    await assert.rejects(
      () =>
        profileImageService.validateUploadedImage(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_TEMP_KEY),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "BAD_REQUEST" &&
        error.message === "업로드된 프로필 이미지를 찾을 수 없습니다.",
    );
  });

  it("returns BAD_REQUEST for unsupported ContentType", async () => {
    installDefaultHeadObjectSuccess("image/gif", 1024);

    await assert.rejects(
      () =>
        profileImageService.validateUploadedImage(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_TEMP_KEY),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "BAD_REQUEST" &&
        error.message === "지원하지 않는 프로필 이미지 형식입니다.",
    );
  });

  it("returns BAD_REQUEST when ContentLength is zero", async () => {
    installDefaultHeadObjectSuccess("image/jpeg", 0);

    await assert.rejects(
      () =>
        profileImageService.validateUploadedImage(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_TEMP_KEY),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "BAD_REQUEST" &&
        error.message === "프로필 이미지 파일이 비어 있습니다.",
    );
  });

  it("returns BAD_REQUEST when ContentLength is missing", async () => {
    installS3SendStub(async (command) => {
      sendCalls.push(command);

      if (command instanceof HeadObjectCommand) {
        return {
          ContentType: "image/jpeg",
        };
      }

      throw new Error("Unexpected command");
    });

    await assert.rejects(
      () =>
        profileImageService.validateUploadedImage(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_TEMP_KEY),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "BAD_REQUEST" &&
        error.message === "프로필 이미지 파일이 비어 있습니다.",
    );
  });

  it("returns BAD_REQUEST when ContentLength exceeds 2MB", async () => {
    installDefaultHeadObjectSuccess("image/jpeg", 2 * 1024 * 1024 + 1);

    await assert.rejects(
      () =>
        profileImageService.validateUploadedImage(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_TEMP_KEY),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "BAD_REQUEST" &&
        error.message === "프로필 이미지는 2MB 이하만 사용할 수 있습니다.",
    );
  });

  it("accepts valid JPEG, PNG, and WebP objects within 2MB", async () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"] as const) {
      sendCalls = [];
      installDefaultHeadObjectSuccess(contentType, 2 * 1024 * 1024);

      await assert.doesNotReject(() =>
        profileImageService.validateUploadedImage(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_TEMP_KEY),
      );
    }
  });

  it("skips validation when key is undefined or null", async () => {
    installDefaultHeadObjectSuccess();

    await profileImageService.validateUploadedImage(PROFILE_IMAGE_USER_ID, undefined);
    await profileImageService.validateUploadedImage(PROFILE_IMAGE_USER_ID, null);

    assert.equal(sendCalls.length, 0);
  });
});

describe("profileImageService.finalizeUploadedImage (temp to final promotion)", () => {
  it("copies temp to profiles/{userId}/{uuid}.{ext} and keeps the remaining path", async () => {
    installDefaultHeadObjectSuccess();

    const finalKey = await profileImageService.finalizeUploadedImage(
      PROFILE_IMAGE_USER_ID,
      PROFILE_IMAGE_TEMP_KEY,
    );

    assertFinalKeyFormat(finalKey, PROFILE_IMAGE_USER_ID);
    assert.equal(finalKey, PROFILE_IMAGE_FINAL_KEY);

    const copyCommands = sendCalls.filter(
      (command): command is CopyObjectCommand => command instanceof CopyObjectCommand,
    );
    assert.equal(copyCommands.length, 1);
    assert.equal(copyCommands[0]?.input.Key, PROFILE_IMAGE_FINAL_KEY);
    assert.match(String(copyCommands[0]?.input.CopySource), /temp\/profiles/);

    const deleteCommands = sendCalls.filter(
      (command): command is DeleteObjectCommand => command instanceof DeleteObjectCommand,
    );
    assert.equal(deleteCommands.length, 0);
  });

  it("returns INTERNAL_SERVER_ERROR when CopyObject fails", async () => {
    installS3SendStub(async (command) => {
      sendCalls.push(command);

      if (command instanceof HeadObjectCommand) {
        return {
          ContentType: "image/jpeg",
          ContentLength: 1024,
        };
      }

      if (command instanceof CopyObjectCommand) {
        throw new Error("copy failed");
      }

      throw new Error("Unexpected command");
    });

    await assert.rejects(
      () =>
        profileImageService.finalizeUploadedImage(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_TEMP_KEY),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "INTERNAL_SERVER_ERROR" &&
        error.message === "프로필 이미지를 최종 저장 위치로 이동하지 못했습니다.",
    );
  });

  it("does not delete the temp object during finalize", async () => {
    installDefaultHeadObjectSuccess();

    await profileImageService.finalizeUploadedImage(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_TEMP_KEY);

    const deleteCommands = sendCalls.filter(
      (command): command is DeleteObjectCommand => command instanceof DeleteObjectCommand,
    );
    assert.equal(deleteCommands.length, 0);
  });
});

describe("profileImageService.deleteTemporaryImage and deleteProfileImage", () => {
  it("deletes owned temp and final keys via DeleteObjectCommand", async () => {
    installS3SendStub(async (command) => {
      sendCalls.push(command);

      if (command instanceof DeleteObjectCommand) {
        return {};
      }

      throw new Error("Unexpected command");
    });

    await profileImageService.deleteTemporaryImage(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_TEMP_KEY);
    await profileImageService.deleteProfileImage(PROFILE_IMAGE_USER_ID, PROFILE_IMAGE_FINAL_KEY);

    assert.equal(sendCalls.length, 2);
    assert.ok(sendCalls.every((command) => command instanceof DeleteObjectCommand));
  });

  it("skips deleteProfileImage for legacy absolute URLs", async () => {
    installS3SendStub(async (command) => {
      sendCalls.push(command);
      return {};
    });

    await profileImageService.deleteProfileImage(
      PROFILE_IMAGE_USER_ID,
      "https://cdn.example.com/profiles/legacy.jpg",
    );

    assert.equal(sendCalls.length, 0);
  });
});
