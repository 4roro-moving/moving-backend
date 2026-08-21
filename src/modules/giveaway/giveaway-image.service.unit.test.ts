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
const EXISTING_FINAL_KEY = `giveaways/${USER_ID}/${IMAGE_A}.jpg`;
const OTHER_GIVEAWAY_FINAL_KEY = `giveaways/${USER_ID}/44444444-4444-4444-8444-444444444444.jpg`;
const FINAL_KEY_PATTERN = new RegExp(
  `^giveaways/${USER_ID}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$`,
  "i",
);

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

function copiedFinalKeys(): string[] {
  return sendCalls
    .filter((command) => command instanceof CopyObjectCommand)
    .map((command) => (command as CopyObjectCommand).input.Key)
    .filter((key): key is string => typeof key === "string");
}

beforeEach(() => {
  sendCalls = [];
  originalSend = s3Client.send.bind(s3Client);
});

afterEach(() => {
  s3Client.send = originalSend;
});

describe("giveawayImageService.finalizeUploadedImages", () => {
  it("copies temp keys to new giveaways/{userId}/{uuid}.ext final keys", async () => {
    installDefaultSuccess();

    const finalizedKeys = await giveawayImageService.finalizeUploadedImages(USER_ID, [
      TEMP_KEY_A,
      TEMP_KEY_B,
    ]);

    assert.equal(finalizedKeys.length, 2);
    assert.match(finalizedKeys[0] ?? "", FINAL_KEY_PATTERN);
    assert.match(finalizedKeys[1] ?? "", FINAL_KEY_PATTERN);
    assert.notEqual(finalizedKeys[0], finalizedKeys[1]);
    assert.notEqual(finalizedKeys[0], `giveaways/${USER_ID}/${IMAGE_A}.jpg`);
    assert.deepEqual(copiedFinalKeys(), finalizedKeys);
  });

  it("issues a new final key when the same temp key is finalized again", async () => {
    installDefaultSuccess();

    const [first] = await giveawayImageService.finalizeUploadedImages(USER_ID, [TEMP_KEY_A]);
    const [second] = await giveawayImageService.finalizeUploadedImages(USER_ID, [TEMP_KEY_A]);

    assert.match(first ?? "", FINAL_KEY_PATTERN);
    assert.match(second ?? "", FINAL_KEY_PATTERN);
    assert.notEqual(first, second);
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
        if (sendCalls.filter((sent) => sent instanceof CopyObjectCommand).length > 1) {
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

    const copiedKeys = copiedFinalKeys();
    const deletedKeys = sendCalls
      .filter((command) => command instanceof DeleteObjectCommand)
      .map((command) => (command as DeleteObjectCommand).input.Key);

    assert.equal(copiedKeys.length, 2);
    assert.deepEqual(deletedKeys, [copiedKeys[0]]);
  });
});

describe("giveawayImageService.prepareUpdatedImages", () => {
  it("keeps existing final keys and copies only temp keys to new final keys", async () => {
    installDefaultSuccess();

    const prepared = await giveawayImageService.prepareUpdatedImages(
      USER_ID,
      [EXISTING_FINAL_KEY, TEMP_KEY_B],
      [EXISTING_FINAL_KEY, `giveaways/${USER_ID}/55555555-5555-4555-8555-555555555555.jpg`],
    );

    assert.equal(prepared.nextKeys[0], EXISTING_FINAL_KEY);
    assert.match(prepared.nextKeys[1] ?? "", FINAL_KEY_PATTERN);
    assert.notEqual(prepared.nextKeys[1], EXISTING_FINAL_KEY);
    assert.deepEqual(prepared.tempKeys, [TEMP_KEY_B]);
    assert.deepEqual(prepared.finalizedKeys, [prepared.nextKeys[1]]);
  });

  it("rejects a final key that does not belong to the current giveaway", async () => {
    installDefaultSuccess();

    await assert.rejects(
      () =>
        giveawayImageService.prepareUpdatedImages(
          USER_ID,
          [OTHER_GIVEAWAY_FINAL_KEY],
          [EXISTING_FINAL_KEY],
        ),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "BAD_REQUEST" &&
        error.message === "다른 나눔 글의 이미지는 재사용할 수 없습니다.",
    );
    assert.equal(sendCalls.length, 0);
  });
});
