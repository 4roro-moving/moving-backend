import { randomUUID } from "node:crypto";

import { HeadObjectCommand, PutObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { AppError } from "../../lib/app-error";
import { s3Client } from "../../lib/s3";
import {
  GIVEAWAY_IMAGE,
  GIVEAWAY_IMAGE_CONTENT_TYPES,
  type CreateGiveawayImageUploadUrlInput,
  type GiveawayImageContentType,
  type GiveawayImageUploadUrlResponse,
} from "./giveaway-image.type";

const ALLOWED_CONTENT_TYPES = new Set<string>(GIVEAWAY_IMAGE_CONTENT_TYPES);

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

function validateImageKeyOwnership(userId: string, key: string): void {
  const expectedPrefix = `${GIVEAWAY_IMAGE.KEY_PREFIX}/${userId}/`;

  if (!key.startsWith(expectedPrefix)) {
    throw new AppError("FORBIDDEN", {
      message: "본인의 나눔 이미지만 등록할 수 있습니다.",
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

async function validateUploadedImage(userId: string, key: string): Promise<void> {
  validateImageKeyOwnership(userId, key);

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

async function validateUploadedImages(userId: string, imageKeys: string[]): Promise<void> {
  await Promise.all(imageKeys.map((imageKey) => validateUploadedImage(userId, imageKey)));
}

async function createUploadUrl(
  userId: string,
  input: CreateGiveawayImageUploadUrlInput,
): Promise<GiveawayImageUploadUrlResponse> {
  const extension = getExtension(input.contentType);
  const key = `${GIVEAWAY_IMAGE.KEY_PREFIX}/${userId}/${randomUUID()}.${extension}`;

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
  validateUploadedImages,
};
