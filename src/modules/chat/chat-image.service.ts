import { randomUUID } from "node:crypto";

import { HeadObjectCommand, PutObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { AppError } from "../../lib/app-error";
import { s3Client } from "../../lib/s3";
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
  const expectedPrefix = `chats/${String(roomId)}/${userId}/`;

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
  const key = `chats/${String(roomId)}/${userId}/${randomUUID()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: input.contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: CHAT_IMAGE_UPLOAD_URL_EXPIRES_IN,
  });

  return {
    uploadUrl,
    key,
    expiresIn: CHAT_IMAGE_UPLOAD_URL_EXPIRES_IN,
  };
};

const validateUploadedImage = async (
  userId: string,
  roomId: number,
  key: string | null | undefined,
): Promise<void> => {
  if (key === undefined || key === null) {
    return;
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
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isS3ObjectNotFoundError(error)) {
      throw new AppError("BAD_REQUEST", {
        message: "업로드된 채팅 이미지를 찾을 수 없습니다.",
      });
    }

    throw error;
  }
};

export const chatImageService = {
  createUploadUrl,
  validateUploadedImage,
};
