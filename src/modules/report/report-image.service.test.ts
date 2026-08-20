import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { S3ServiceException } from "@aws-sdk/client-s3";

import { AppError } from "../../lib/app-error";
import { s3Client } from "../../lib/s3";

import { reportImageService } from "./report-image.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OWNED_KEY = `reports/${USER_ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;

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
          "reports/22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg",
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
