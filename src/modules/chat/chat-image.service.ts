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
import { CHAT_IMAGE_MAX_SIZE } from "./chat-image.type";
import { chatRepository } from "./chat.repository";

import type { ChatImageUploadUrlResponse, CreateChatImageUploadUrlInput } from "./chat-image.type";

const CHAT_IMAGE_UPLOAD_URL_EXPIRES_IN = 180;
const ALLOWED_CHAT_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const bucketName = process.env.AWS_S3_BUCKET;

if (!bucketName) {
  throw new AppError("INTERNAL_SERVER_ERROR", {
    message: "AWS_S3_BUCKET 환경변수가 설정되지 않았습니다.",
  });
}

const getExtension = (contentType: CreateChatImageUploadUrlInput["contentType"]) => {
  const extensionMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  } as const;

  return extensionMap[contentType];
};

const getExtensionFromKey = (key: string): string => key.split(".").at(-1) ?? "jpg";

const assertRoomParticipant = async (userId: string, roomId: number): Promise<void> => {
  const room = await chatRepository.findRoomById(roomId);

  if (!room) {
    throw new AppError("NOT_FOUND", {
      message: "채팅방을 찾을 수 없습니다.",
    });
  }

  if (room.customerId !== userId && room.moverId !== userId) {
    throw new AppError("FORBIDDEN", {
      message: "해당 채팅방의 이미지를 사용할 권한이 없습니다.",
    });
  }
};

const validateImageKeyOwnership = (userId: string, roomId: number, key: string): void => {
  const expectedPrefix = `chats/${String(roomId)}/${userId}/staging/`;

  if (!key.startsWith(expectedPrefix)) {
    throw new AppError("FORBIDDEN", {
      message: "해당 채팅방에 업로드한 이미지만 사용할 수 있습니다.",
    });
  }
};

const isS3ObjectNotFoundError = (error: unknown): boolean => {
  if (!(error instanceof S3ServiceException)) {
    return false;
  }

  return (
    error.name === "NotFound" ||
    error.name === "NoSuchKey" ||
    error.$metadata.httpStatusCode === 404
  );
};

const createUploadUrl = async (
  userId: string,
  roomId: number,
  input: CreateChatImageUploadUrlInput,
): Promise<ChatImageUploadUrlResponse> => {
  await assertRoomParticipant(userId, roomId);

  const extension = getExtension(input.contentType);
  const key = `chats/${String(roomId)}/${userId}/staging/${randomUUID()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: input.contentType,
  });

  let uploadUrl: string;

  try {
    uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: CHAT_IMAGE_UPLOAD_URL_EXPIRES_IN,
    });
  } catch (error) {
    logger.error("Failed to create chat image upload URL.", {
      error,
      roomId,
      userId,
      key,
    });

    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "채팅 이미지 업로드 URL을 발급하지 못했습니다.",
    });
  }

  return {
    uploadUrl,
    key,
    expiresIn: CHAT_IMAGE_UPLOAD_URL_EXPIRES_IN,
  };
};

const deleteStagingImage = async (key: string): Promise<void> => {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
  } catch (error) {
    logger.error("Failed to delete staging chat image.", {
      error,
      key,
    });
  }
};

const copyToFinalImage = async (params: {
  userId: string;
  roomId: number;
  sourceKey: string;
}): Promise<string> => {
  const extension = getExtensionFromKey(params.sourceKey);
  const finalKey = `chats/${String(params.roomId)}/${params.userId}/messages/${randomUUID()}.${extension}`;

  try {
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: bucketName,
        CopySource: `${bucketName}/${params.sourceKey}`,
        Key: finalKey,
      }),
    );
  } catch (error) {
    logger.error("Failed to copy chat image to final key.", {
      error,
      roomId: params.roomId,
      userId: params.userId,
      sourceKey: params.sourceKey,
      finalKey,
    });

    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "채팅 이미지를 저장하지 못했습니다.",
    });
  }

  return finalKey;
};

const finalizeUploadedImage = async (
  userId: string,
  roomId: number,
  key: string | null | undefined,
): Promise<string> => {
  if (key === undefined || key === null) {
    throw new AppError("BAD_REQUEST", {
      message: "이미지 Key를 입력해주세요.",
    });
  }

  await assertRoomParticipant(userId, roomId);
  validateImageKeyOwnership(userId, roomId, key);

  try {
    const metadata = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );

    if (!metadata.ContentType || !ALLOWED_CHAT_IMAGE_CONTENT_TYPES.has(metadata.ContentType)) {
      throw new AppError("BAD_REQUEST", {
        message: "지원하지 않는 채팅 이미지 형식입니다.",
      });
    }

    if (metadata.ContentLength === undefined || metadata.ContentLength <= 0) {
      throw new AppError("BAD_REQUEST", {
        message: "채팅 이미지 파일이 비어 있습니다.",
      });
    }

    if (metadata.ContentLength > CHAT_IMAGE_MAX_SIZE) {
      throw new AppError("BAD_REQUEST", {
        message: "채팅 이미지는 25MB 이하만 사용할 수 있습니다.",
      });
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isS3ObjectNotFoundError(error)) {
      throw new AppError("BAD_REQUEST", {
        message: "업로드된 채팅 이미지를 찾을 수 없습니다.",
      });
    }

    logger.error("Failed to validate uploaded chat image.", {
      error,
      roomId,
      userId,
      key,
    });

    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "업로드된 채팅 이미지를 검증하지 못했습니다.",
    });
  }

  const finalKey = await copyToFinalImage({
    userId,
    roomId,
    sourceKey: key,
  });

  void deleteStagingImage(key);

  return finalKey;
};

export const chatImageService = {
  createUploadUrl,
  finalizeUploadedImage,
};
