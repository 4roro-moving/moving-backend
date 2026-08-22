import "dotenv/config";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DeleteObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";

import { AppError } from "../../lib/app-error";
import { s3Client } from "../../lib/s3";

import { reportImageService } from "./report-image.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const OWNED_KEY = `temp/reports/${USER_ID}/` + "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";

const RUN_S3_INTEGRATION_TESTS = process.env.RUN_S3_INTEGRATION_TESTS === "1";

const s3IntegrationTest = RUN_S3_INTEGRATION_TESTS ? it : it.skip;

function createNotFoundError(): S3ServiceException {
  const error = Object.create(S3ServiceException.prototype) as S3ServiceException;

  Object.assign(error, {
    name: "NoSuchKey",
    $metadata: {
      httpStatusCode: 404,
    },
  });

  return error;
}

describe("reportImageService.validateUploadedImages", () => {
  it("rejects another user's image key before S3 lookup", async () => {
    await assert.rejects(
      () =>
        reportImageService.validateUploadedImages(USER_ID, [
          "temp/reports/22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg",
        ]),
      (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
    );
  });

  it("rejects unsupported MIME types", async () => {
    const originalSend = s3Client.send.bind(s3Client);

    s3Client.send = (async () => ({
      ContentType: "image/gif",
      ContentLength: 1024,
    })) as typeof s3Client.send;

    try {
      await assert.rejects(
        () => reportImageService.validateUploadedImages(USER_ID, [OWNED_KEY]),
        (error: unknown) => error instanceof AppError && error.code === "BAD_REQUEST",
      );
    } finally {
      s3Client.send = originalSend;
    }
  });

  it("rejects images larger than 5MB", async () => {
    const originalSend = s3Client.send.bind(s3Client);

    s3Client.send = (async () => ({
      ContentType: "image/jpeg",
      ContentLength: 5 * 1024 * 1024 + 1,
    })) as typeof s3Client.send;

    try {
      await assert.rejects(
        () => reportImageService.validateUploadedImages(USER_ID, [OWNED_KEY]),
        (error: unknown) => error instanceof AppError && error.code === "BAD_REQUEST",
      );
    } finally {
      s3Client.send = originalSend;
    }
  });

  it("rejects missing S3 objects", async () => {
    const originalSend = s3Client.send.bind(s3Client);

    s3Client.send = (async () => {
      throw createNotFoundError();
    }) as typeof s3Client.send;

    try {
      await assert.rejects(
        () => reportImageService.validateUploadedImages(USER_ID, [OWNED_KEY]),
        (error: unknown) => error instanceof AppError && error.code === "BAD_REQUEST",
      );
    } finally {
      s3Client.send = originalSend;
    }
  });
});

it("rejects final report keys because only temp keys can be attached", async () => {
  await assert.rejects(
    () =>
      reportImageService.validateUploadedImages(USER_ID, [
        `reports/${USER_ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`,
      ]),
    (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
  );
});

describe("reportImageService.createUploadUrl", () => {
  s3IntegrationTest("rejects a second upload to the same key with HTTP 412", async () => {
    const bucketName = process.env.AWS_S3_BUCKET;

    assert.ok(bucketName, "AWS_S3_BUCKET 환경변수가 필요합니다.");

    const { uploadUrl, key } = await reportImageService.createUploadUrl(USER_ID, {
      contentType: "image/jpeg",
    });

    assert.ok(
      key.startsWith(`temp/reports/${USER_ID}/`),
      "업로드 Key는 temp/reports 사용자 경로여야 합니다.",
    );

    const body = Buffer.from("report-image-conditional-write-test");

    try {
      const firstResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
          "If-None-Match": "*",
        },
        body,
      });

      assert.equal(
        firstResponse.ok,
        true,
        `첫 번째 업로드는 성공해야 합니다. status=${String(firstResponse.status)}`,
      );

      const secondResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
          "If-None-Match": "*",
        },
        body,
      });

      assert.equal(
        secondResponse.status,
        412,
        "동일 Key 재업로드는 412 Precondition Failed여야 합니다.",
      );
    } finally {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
      );
    }
  });
});
