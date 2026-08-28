import { randomUUID } from "node:crypto";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { AppError } from "../../lib/app-error";
import { s3Client } from "../../lib/s3";

import type {
  CreateReportImageUploadUrlInput,
  ReportImageContentType,
  ReportImageUploadUrlResponse,
} from "./report-image.type";
import { REPORT_IMAGE, REPORT_IMAGE_CONTENT_TYPES } from "./report-image.type";

const allowedContentTypes = new Set<string>(REPORT_IMAGE_CONTENT_TYPES);

const bucketName = process.env.AWS_S3_BUCKET;

if (!bucketName) {
  throw new AppError("INTERNAL_SERVER_ERROR", {
    message: "AWS_S3_BUCKET 환경변수가 설정되지 않았습니다.",
  });
}

function getExtension(contentType: ReportImageContentType): string {
  const extensionMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  } as const;

  return extensionMap[contentType];
}

function getExpectedTempPrefix(userId: string): string {
  return `${REPORT_IMAGE.TEMP_KEY_PREFIX}/${userId}/`;
}

function validateTempImageKeyOwnership(userId: string, key: string): void {
  const expectedPrefix = getExpectedTempPrefix(userId);

  if (!key.startsWith(expectedPrefix)) {
    throw new AppError("FORBIDDEN", {
      message: "본인이 업로드한 신고 이미지만 첨부할 수 있습니다.",
    });
  }
}

function toFinalImageKey(userId: string, tempKey: string): string {
  validateTempImageKeyOwnership(userId, tempKey);

  const fileName = tempKey.slice(getExpectedTempPrefix(userId).length);

  return `${REPORT_IMAGE.FINAL_KEY_PREFIX}/${userId}/${fileName}`;
}

function encodeCopySource(key: string): string {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${bucketName}/${encodedKey}`;
}

function isS3ObjectNotFoundError(error: unknown): boolean {
  if (!(error instanceof S3ServiceException)) {
    return false;
  }

  return (
    error.name === "NotFound" ||
    error.name === "NoSuchKey" ||
    error.$metadata.httpStatusCode === 404
  );
}

async function deleteObject(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
}

async function deleteObjectsBestEffort(keys: string[]): Promise<void> {
  await Promise.allSettled(keys.map((key) => deleteObject(key)));
}

async function validateUploadedImage(userId: string, key: string): Promise<void> {
  validateTempImageKeyOwnership(userId, key);

  try {
    const metadata = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );

    if (!metadata.ContentType || !allowedContentTypes.has(metadata.ContentType)) {
      throw new AppError("BAD_REQUEST", {
        message: "지원하지 않는 신고 이미지 형식입니다.",
      });
    }

    if (metadata.ContentLength === undefined || metadata.ContentLength <= 0) {
      throw new AppError("BAD_REQUEST", {
        message: "신고 이미지 파일이 비어 있습니다.",
      });
    }

    if (metadata.ContentLength > REPORT_IMAGE.MAX_SIZE) {
      throw new AppError("BAD_REQUEST", {
        message: `신고 이미지는 ${String(
          REPORT_IMAGE.MAX_SIZE / (1024 * 1024),
        )}MB 이하여야 합니다.`,
      });
    }
  } catch (error) {
    if (error instanceof AppError) {
      await deleteObjectsBestEffort([key]);
      throw error;
    }

    if (isS3ObjectNotFoundError(error)) {
      throw new AppError("BAD_REQUEST", {
        message: "업로드된 신고 이미지를 찾을 수 없습니다.",
      });
    }

    throw error;
  }
}

async function validateUploadedImages(
  userId: string,
  imageKeys: string[] | undefined,
): Promise<void> {
  if (!imageKeys || imageKeys.length === 0) {
    return;
  }

  if (new Set(imageKeys).size !== imageKeys.length) {
    throw new AppError("BAD_REQUEST", {
      message: "이미지 Key는 중복될 수 없습니다.",
    });
  }

  await Promise.all(imageKeys.map((key) => validateUploadedImage(userId, key)));
}

async function promoteUploadedImages(
  userId: string,
  imageKeys: string[] | undefined,
): Promise<{
  tempKeys: string[];
  finalKeys: string[];
}> {
  if (!imageKeys || imageKeys.length === 0) {
    return {
      tempKeys: [],
      finalKeys: [],
    };
  }

  await validateUploadedImages(userId, imageKeys);

  const promotedFinalKeys: string[] = [];

  try {
    for (const tempKey of imageKeys) {
      const finalKey = toFinalImageKey(userId, tempKey);

      await s3Client.send(
        new CopyObjectCommand({
          Bucket: bucketName,
          CopySource: encodeCopySource(tempKey),
          Key: finalKey,
          ContentType: undefined,
          MetadataDirective: "COPY",
        }),
      );

      promotedFinalKeys.push(finalKey);
    }

    return {
      tempKeys: imageKeys,
      finalKeys: promotedFinalKeys,
    };
  } catch (error) {
    await deleteObjectsBestEffort(promotedFinalKeys);
    throw error;
  }
}

async function cleanupTempImages(tempKeys: string[]): Promise<void> {
  await deleteObjectsBestEffort(tempKeys);
}

async function cleanupFinalImages(finalKeys: string[]): Promise<void> {
  await deleteObjectsBestEffort(finalKeys);
}

async function createUploadUrl(
  userId: string,
  input: CreateReportImageUploadUrlInput,
): Promise<ReportImageUploadUrlResponse> {
  const extension = getExtension(input.contentType);

  const key = `${REPORT_IMAGE.TEMP_KEY_PREFIX}/` + `${userId}/${randomUUID()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: input.contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: REPORT_IMAGE.UPLOAD_URL_EXPIRES_IN,
  });

  return {
    uploadUrl,
    key,
    expiresIn: REPORT_IMAGE.UPLOAD_URL_EXPIRES_IN,
  };
}

export const reportImageService = {
  createUploadUrl,
  validateUploadedImages,
  promoteUploadedImages,
  cleanupTempImages,
  cleanupFinalImages,
};
