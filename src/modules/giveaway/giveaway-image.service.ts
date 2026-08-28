import { randomUUID } from "node:crypto";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import logger from "../../config/logger";
import { AppError } from "../../lib/app-error";
import { s3Client } from "../../lib/s3";
import { cleanupGiveawayImagesSafely } from "./giveaway-image.cleanup";
import {
  GIVEAWAY_IMAGE,
  GIVEAWAY_IMAGE_CONTENT_TYPES,
  type CreateGiveawayImageUploadUrlInput,
  type GiveawayImageContentType,
  type GiveawayImageUploadUrlResponse,
} from "./giveaway-image.type";

const ALLOWED_CONTENT_TYPES = new Set<string>(GIVEAWAY_IMAGE_CONTENT_TYPES);

export type PreparedGiveawayImages = {
  nextKeys: string[];
  tempKeys: string[];
  finalizedKeys: string[];
};

function getBucketName(): string {
  const bucketName = process.env.AWS_S3_BUCKET;

  if (!bucketName) {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "AWS_S3_BUCKET 환경변수가 설정되지 않았습니다.",
    });
  }

  return bucketName;
}

function getExtension(contentType: GiveawayImageContentType) {
  const extensionMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  } as const;

  return extensionMap[contentType];
}

function isTemporaryImageKey(key: string): boolean {
  return key.startsWith(`${GIVEAWAY_IMAGE.TEMP_PREFIX}/`);
}

function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function validateTemporaryImageKeyOwnership(userId: string, key: string): void {
  const expectedPrefix = `${GIVEAWAY_IMAGE.TEMP_PREFIX}/${userId}/`;

  if (!key.startsWith(expectedPrefix)) {
    throw new AppError("FORBIDDEN", {
      message: "본인의 나눔 이미지만 등록할 수 있습니다.",
    });
  }
}

function validateFinalImageKeyOwnership(userId: string, key: string): void {
  const expectedPrefix = `${GIVEAWAY_IMAGE.FINAL_PREFIX}/${userId}/`;

  if (!key.startsWith(expectedPrefix)) {
    throw new AppError("FORBIDDEN", {
      message: "본인의 나눔 이미지만 삭제할 수 있습니다.",
    });
  }
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

function createCopySource(key: string): string {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${getBucketName()}/${encodedKey}`;
}

function getFinalImageKey(userId: string, tempKey: string): string {
  if (!isTemporaryImageKey(tempKey)) {
    throw new AppError("BAD_REQUEST", {
      message: "올바른 임시 나눔 이미지 Key가 아닙니다.",
    });
  }

  const extension = tempKey.slice(tempKey.lastIndexOf(".") + 1);

  if (!extension || extension === tempKey) {
    throw new AppError("BAD_REQUEST", {
      message: "올바른 임시 나눔 이미지 Key가 아닙니다.",
    });
  }

  return `${GIVEAWAY_IMAGE.FINAL_PREFIX}/${userId}/${randomUUID()}.${extension}`;
}

async function validateUploadedImage(userId: string, key: string): Promise<void> {
  validateTemporaryImageKeyOwnership(userId, key);

  try {
    const metadata = await s3Client.send(
      new HeadObjectCommand({
        Bucket: getBucketName(),
        Key: key,
      }),
    );

    if (!metadata.ContentType || !ALLOWED_CONTENT_TYPES.has(metadata.ContentType)) {
      throw new AppError("BAD_REQUEST", {
        message: "지원하지 않는 나눔 이미지 형식입니다.",
      });
    }

    if (metadata.ContentLength === undefined || metadata.ContentLength <= 0) {
      throw new AppError("BAD_REQUEST", {
        message: "나눔 이미지 파일이 비어 있습니다.",
      });
    }

    if (metadata.ContentLength > GIVEAWAY_IMAGE.MAX_SIZE) {
      throw new AppError("BAD_REQUEST", {
        message: `나눔 이미지는 ${String(GIVEAWAY_IMAGE.MAX_SIZE / (1024 * 1024))}MB 이하만 사용할 수 있습니다.`,
      });
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isS3ObjectNotFoundError(error)) {
      throw new AppError("BAD_REQUEST", {
        message: "업로드된 나눔 이미지를 찾을 수 없습니다.",
      });
    }

    throw error;
  }
}

async function finalizeUploadedImage(userId: string, tempKey: string): Promise<string> {
  await validateUploadedImage(userId, tempKey);

  const finalKey = getFinalImageKey(userId, tempKey);

  try {
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: getBucketName(),
        CopySource: createCopySource(tempKey),
        Key: finalKey,
      }),
    );
  } catch (error) {
    logger.error("나눔 이미지를 최종 저장 위치로 복사하지 못했습니다.", {
      error,
      userId,
      tempKey,
      finalKey,
    });

    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "나눔 이미지를 최종 저장 위치로 이동하지 못했습니다.",
    });
  }

  return finalKey;
}

async function rollbackFinalizedImages(userId: string, finalKeys: string[]): Promise<void> {
  await cleanupGiveawayImagesSafely(finalKeys, (key) => deleteFinalImage(userId, key), {
    userId,
    action: "ROLLBACK_FINALIZED_IMAGE",
  });
}

async function finalizeUploadedImages(userId: string, tempKeys: string[]): Promise<string[]> {
  const finalizedKeys: string[] = [];

  try {
    for (const tempKey of tempKeys) {
      finalizedKeys.push(await finalizeUploadedImage(userId, tempKey));
    }

    return finalizedKeys;
  } catch (error) {
    await rollbackFinalizedImages(userId, finalizedKeys);
    throw error;
  }
}

async function deleteTemporaryImage(userId: string, tempKey: string): Promise<void> {
  validateTemporaryImageKeyOwnership(userId, tempKey);

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: tempKey,
    }),
  );
}

async function deleteFinalImage(userId: string, key: string): Promise<void> {
  if (!key || isAbsoluteUrl(key)) {
    return;
  }

  validateFinalImageKeyOwnership(userId, key);

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
  );
}

async function prepareUpdatedImages(
  userId: string,
  imageKeys: string[],
  currentKeys: string[],
): Promise<PreparedGiveawayImages> {
  const currentKeySet = new Set(currentKeys);

  for (const key of imageKeys) {
    if (!isTemporaryImageKey(key) && !currentKeySet.has(key)) {
      throw new AppError("BAD_REQUEST", {
        message: "다른 나눔 글의 이미지는 재사용할 수 없습니다.",
      });
    }
  }

  const tempKeys = imageKeys.filter((key) => isTemporaryImageKey(key));
  const finalizedKeys = await finalizeUploadedImages(userId, tempKeys);
  const tempToFinal = new Map(
    tempKeys.map((tempKey, index) => [tempKey, finalizedKeys[index] ?? tempKey]),
  );

  return {
    nextKeys: imageKeys.map((key) => tempToFinal.get(key) ?? key),
    tempKeys,
    finalizedKeys,
  };
}

async function createUploadUrl(
  userId: string,
  input: CreateGiveawayImageUploadUrlInput,
): Promise<GiveawayImageUploadUrlResponse> {
  const extension = getExtension(input.contentType);
  const key = `${GIVEAWAY_IMAGE.TEMP_PREFIX}/${userId}/${randomUUID()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: input.contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: GIVEAWAY_IMAGE.UPLOAD_URL_EXPIRES_IN,
  });

  return {
    uploadUrl,
    key,
    expiresIn: GIVEAWAY_IMAGE.UPLOAD_URL_EXPIRES_IN,
  };
}

export const giveawayImageService = {
  createUploadUrl,
  finalizeUploadedImages,
  prepareUpdatedImages,
  deleteTemporaryImage,
  deleteFinalImage,
  rollbackFinalizedImages,
};
