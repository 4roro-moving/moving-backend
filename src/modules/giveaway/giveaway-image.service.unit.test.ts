import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";

import { AppError } from "../../lib/app-error";

process.env.AWS_REGION ??= "ap-northeast-2";
process.env.AWS_S3_BUCKET ??= "test-giveaway-bucket";

const { s3Client } = await import("../../lib/s3");
const { giveawayImageService } = await import("./giveaway-image.service");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_A = "22222222-2222-4222-8222-222222222222";
const IMAGE_B = "33333333-3333-4333-8333-333333333333";
const TEMP_KEY_A = `temp/giveaways/${USER_ID}/${IMAGE_A}.jpg`;
const TEMP_KEY_B = `temp/giveaways/${USER_ID}/${IMAGE_B}.jpg`;
const FINAL_KEY_A = `giveaways/${USER_ID}/${IMAGE_A}.jpg`;
const FINAL_KEY_B = `giveaways/${USER_ID}/${IMAGE_B}.jpg`;
const OTHER_GIVEAWAY_FINAL_KEY = `giveaways/${USER_ID}/44444444-4444-4444-8444-444444444444.jpg`;

let sendCalls: unknown[] = [];
let originalSend: typeof s3Client.send;

function installS3SendStub(handler: (command: unknown) => Promise<unknown> | unknown): void {
  s3Client.send = (async (command: unknown) => handler(command)) as typeof s3Client.send;
}

function installDefaultSuccess(contentType = "image/jpeg", contentLength = 1024): void {
  installS3SendStub(async (command) => {
    sendCalls.push(command);

    if (command instanceof HeadObjectCommand) {
      return {
        ContentType: contentType,
        ContentLength: contentLength,
      };
    }

    if (command instanceof CopyObjectCommand || command instanceof DeleteObjectCommand) {
      return {};
    }

    throw new Error(`Unexpected S3 command: ${String(command)}`);
  });
}

beforeEach(() => {
  sendCalls = [];
  originalSend = s3Client.send.bind(s3Client);
});

afterEach(() => {
  s3Client.send = originalSend;
});

describe("giveawayImageService.finalizeUploadedImages", () => {
  it("copies temp keys to giveaways/{userId}/... final keys", async () => {
    installDefaultSuccess();

    const finalizedKeys = await giveawayImageService.finalizeUploadedImages(USER_ID, [
      TEMP_KEY_A,
      TEMP_KEY_B,
    ]);

    assert.deepEqual(finalizedKeys, [FINAL_KEY_A, FINAL_KEY_B]);
    assert.equal(sendCalls.filter((command) => command instanceof CopyObjectCommand).length, 2);
  });

  it("rejects another user's temp key before calling S3", async () => {
    installDefaultSuccess();

    await assert.rejects(
      () =>
        giveawayImageService.finalizeUploadedImages(USER_ID, [
          `temp/giveaways/99999999-9999-4999-8999-999999999999/${IMAGE_A}.jpg`,
        ]),
      (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
    );
    assert.equal(sendCalls.length, 0);
  });

  it("rolls back copied finals when a later copy fails", async () => {
    installS3SendStub(async (command) => {
      sendCalls.push(command);

      if (command instanceof HeadObjectCommand) {
        return { ContentType: "image/jpeg", ContentLength: 1024 };
      }

      if (command instanceof CopyObjectCommand) {
        if (command.input.Key === FINAL_KEY_B) {
          throw new S3ServiceException({
            name: "InternalError",
            $fault: "server",
            $metadata: { httpStatusCode: 500 },
          });
        }

        return {};
      }

      if (command instanceof DeleteObjectCommand) {
        return {};
      }

      throw new Error("Unexpected command");
    });

    await assert.rejects(
      () => giveawayImageService.finalizeUploadedImages(USER_ID, [TEMP_KEY_A, TEMP_KEY_B]),
      (error: unknown) => error instanceof AppError && error.code === "INTERNAL_SERVER_ERROR",
    );

    const deletedKeys = sendCalls
      .filter((command) => command instanceof DeleteObjectCommand)
      .map((command) => (command as DeleteObjectCommand).input.Key);

    assert.deepEqual(deletedKeys, [FINAL_KEY_A]);
  });
});

describe("giveawayImageService.prepareUpdatedImages", () => {
  it("keeps existing final keys and copies only temp keys", async () => {
    installDefaultSuccess();

    const prepared = await giveawayImageService.prepareUpdatedImages(
      USER_ID,
      [FINAL_KEY_A, TEMP_KEY_B],
      [FINAL_KEY_A, `giveaways/${USER_ID}/55555555-5555-4555-8555-555555555555.jpg`],
    );

    assert.deepEqual(prepared.nextKeys, [FINAL_KEY_A, FINAL_KEY_B]);
    assert.deepEqual(prepared.tempKeys, [TEMP_KEY_B]);
    assert.deepEqual(prepared.finalizedKeys, [FINAL_KEY_B]);
  });

  it("rejects a final key that does not belong to the current giveaway", async () => {
    installDefaultSuccess();

    await assert.rejects(
      () =>
        giveawayImageService.prepareUpdatedImages(
          USER_ID,
          [OTHER_GIVEAWAY_FINAL_KEY],
          [FINAL_KEY_A],
        ),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "BAD_REQUEST" &&
        error.message === "다른 나눔 글의 이미지는 재사용할 수 없습니다.",
    );
    assert.equal(sendCalls.length, 0);
  });
});
