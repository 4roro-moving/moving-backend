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
  CreateProfileImageUploadUrlInput,
  ProfileImageUploadUrlResponse,
} from "./profile-image.type";

const PROFILE_IMAGE_UPLOAD_URL_EXPIRES_IN = 180;
const PROFILE_IMAGE_MAX_SIZE = 2 * 1024 * 1024;

const PROFILE_IMAGE_TEMP_PREFIX = "temp/profiles";
const PROFILE_IMAGE_FINAL_PREFIX = "profiles";

const ALLOWED_PROFILE_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const bucketName = process.env.AWS_S3_BUCKET;

if (!bucketName) {
  throw new AppError("INTERNAL_SERVER_ERROR", {
    message: "AWS_S3_BUCKET 환경변수가 설정되지 않았습니다.",
  });
}

/**
 * MIME 타입에 대응하는 파일 확장자를 반환한다.
 */
const getExtension = (contentType: CreateProfileImageUploadUrlInput["contentType"]) => {
  const extensionMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  } as const;

  return extensionMap[contentType];
};

/**
 * 전달받은 임시 이미지 Key가 현재 로그인한 사용자의
 * temp 프로필 이미지 경로에 속하는지 확인한다.
 */
const validateTemporaryImageKeyOwnership = (userId: string, key: string): void => {
  const expectedPrefix = `${PROFILE_IMAGE_TEMP_PREFIX}/${userId}/`;

  if (!key.startsWith(expectedPrefix)) {
    throw new AppError("FORBIDDEN", {
      message: "본인의 프로필 이미지만 등록할 수 있습니다.",
    });
  }
};

/**
 * 최종 프로필 이미지 Key가 현재 사용자의
 * 프로필 이미지 경로에 속하는지 확인한다.
 *
 * 기존 이미지 삭제 시 다른 사용자의 S3 객체를
 * 삭제하지 않도록 방어하기 위해 사용한다.
 */
const validateFinalImageKeyOwnership = (userId: string, key: string): void => {
  const expectedPrefix = `${PROFILE_IMAGE_FINAL_PREFIX}/${userId}/`;

  if (!key.startsWith(expectedPrefix)) {
    throw new AppError("FORBIDDEN", {
      message: "본인의 프로필 이미지만 삭제할 수 있습니다.",
    });
  }
};

/**
 * S3 HeadObject 요청에서 객체가 존재하지 않는 경우인지 확인한다.
 */
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

/**
 * 기존 데이터에 완전한 URL이 저장되어 있는지 확인한다.
 *
 * 과거 프로필 데이터의 URL 값을 S3 Key로 오인하여
 * 삭제 요청하지 않도록 하기 위한 호환 처리다.
 */
const isAbsoluteUrl = (value: string): boolean => {
  return value.startsWith("http://") || value.startsWith("https://");
};

/**
 * CopyObject의 CopySource 값으로 사용할 수 있도록
 * S3 Key의 각 path segment를 URL encode한다.
 */
const createCopySource = (key: string): string => {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${bucketName}/${encodedKey}`;
};

/**
 * 임시 프로필 이미지 Key를 최종 프로필 이미지 Key로 변환한다.
 *
 * temp/profiles/{userId}/{imageId}.{extension}
 * -> profiles/{userId}/{imageId}.{extension}
 */
const getFinalImageKey = (tempKey: string): string => {
  const tempPrefix = "temp/";

  if (!tempKey.startsWith(tempPrefix)) {
    throw new AppError("BAD_REQUEST", {
      message: "올바른 임시 프로필 이미지 Key가 아닙니다.",
    });
  }

  return tempKey.slice(tempPrefix.length);
};

/**
 * 프로필에 저장하려는 임시 이미지가 실제 S3에 존재하는지 확인하고,
 * 업로드된 객체의 MIME 타입과 크기를 검증한다.
 *
 * - undefined: 이미지 변경 없음
 * - null: 기존 이미지 삭제
 * - string: temp Key 소유권 및 S3 객체 검증
 */
const validateUploadedImage = async (
  userId: string,
  key: string | null | undefined,
): Promise<void> => {
  if (key === undefined || key === null) {
    return;
  }

  /**
   * S3 요청 전에 현재 사용자의 temp 이미지 Key인지
   * 먼저 확인한다.
   */
  validateTemporaryImageKeyOwnership(userId, key);

  try {
    const metadata = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );

    /**
     * 실제 S3 객체의 Content-Type을 다시 확인한다.
     */
    if (!metadata.ContentType || !ALLOWED_PROFILE_IMAGE_CONTENT_TYPES.has(metadata.ContentType)) {
      throw new AppError("BAD_REQUEST", {
        message: "지원하지 않는 프로필 이미지 형식입니다.",
      });
    }

    /**
     * 비어 있는 파일은 프로필 이미지로 사용할 수 없다.
     */
    if (metadata.ContentLength === undefined || metadata.ContentLength <= 0) {
      throw new AppError("BAD_REQUEST", {
        message: "프로필 이미지 파일이 비어 있습니다.",
      });
    }

    /**
     * 실제 업로드된 객체도 최대 2MB까지만 허용한다.
     */
    if (metadata.ContentLength > PROFILE_IMAGE_MAX_SIZE) {
      throw new AppError("BAD_REQUEST", {
        message: "프로필 이미지는 2MB 이하만 사용할 수 있습니다.",
      });
    }
  } catch (error) {
    /**
     * 위에서 직접 발생시킨 비즈니스 에러는 그대로 전달한다.
     */
    if (error instanceof AppError) {
      throw error;
    }

    /**
     * Key 형식은 정상이더라도 실제 temp 객체가
     * 존재하지 않거나 Lifecycle 등에 의해 삭제됐을 수 있다.
     */
    if (isS3ObjectNotFoundError(error)) {
      throw new AppError("BAD_REQUEST", {
        message: "업로드된 프로필 이미지를 찾을 수 없습니다.",
      });
    }

    /**
     * AWS 권한 문제나 S3 장애 등 예상하지 못한 오류는
     * 사용자 입력 오류로 변환하지 않고 상위 에러 처리기로 전달한다.
     */
    throw error;
  }
};

/**
 * 검증이 완료된 임시 프로필 이미지를
 * 최종 profiles 경로로 복사한다.
 *
 * 이 함수에서는 temp 객체를 삭제하지 않는다.
 *
 * 이후 프로필 DB 저장이 실패할 가능성이 있기 때문에
 * DB 작업 성공 후 별도로 temp 객체를 정리해야 한다.
 *
 * @returns DB에 저장할 최종 S3 Key
 */
const finalizeUploadedImage = async (userId: string, tempKey: string): Promise<string> => {
  /**
   * 이 함수가 다른 경로에서 직접 호출되더라도
   * 검증되지 않은 객체가 final 영역으로 이동하지 않도록
   * 여기서 다시 업로드 객체 검증을 수행한다.
   */
  await validateUploadedImage(userId, tempKey);

  const finalKey = getFinalImageKey(tempKey);

  try {
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: bucketName,
        CopySource: createCopySource(tempKey),
        Key: finalKey,
      }),
    );

    return finalKey;
  } catch {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "프로필 이미지를 최종 저장 위치로 이동하지 못했습니다.",
    });
  }
};

/**
 * 임시 프로필 이미지 객체를 삭제한다.
 *
 * 프로필 DB 저장이 정상적으로 완료된 이후 호출한다.
 *
 * 삭제에 실패한 경우 호출한 Service에서
 * 프로필 작업 자체를 실패시킬지 여부를 결정할 수 있도록
 * 오류를 그대로 전달한다.
 */
const deleteTemporaryImage = async (userId: string, tempKey: string): Promise<void> => {
  validateTemporaryImageKeyOwnership(userId, tempKey);

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: tempKey,
    }),
  );
};

/**
 * 더 이상 사용하지 않는 최종 프로필 이미지 객체를 삭제한다.
 *
 * 기존 레거시 데이터가 완전한 URL 형태인 경우에는
 * 현재 S3 Key로 안전하게 판단할 수 없으므로 삭제하지 않는다.
 */
const deleteProfileImage = async (
  userId: string,
  key: string | null | undefined,
): Promise<void> => {
  if (!key || isAbsoluteUrl(key)) {
    return;
  }

  validateFinalImageKeyOwnership(userId, key);

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
};

/**
 * 프로필 이미지 업로드에 사용할 Presigned URL을 생성한다.
 *
 * 프론트에서 파일 자체를 전달받지 않고,
 * 파일 정보만 검증한 뒤 S3 직접 업로드 권한을 발급한다.
 *
 * 신규 이미지는 최종 profiles 경로가 아닌
 * temp/profiles 경로에 먼저 업로드한다.
 */
const createUploadUrl = async (
  userId: string,
  input: CreateProfileImageUploadUrlInput,
): Promise<ProfileImageUploadUrlResponse> => {
  const extension = getExtension(input.contentType);

  /**
   * 프론트에서 임의의 Key를 전달받지 않고,
   * 인증된 사용자 ID와 UUID를 기준으로 백엔드에서 생성한다.
   *
   * 프로필 저장 전 이탈하거나 저장에 실패한 이미지를
   * Lifecycle로 정리할 수 있도록 temp 경로를 사용한다.
   */
  const key = `${PROFILE_IMAGE_TEMP_PREFIX}/${userId}/` + `${randomUUID()}.${extension}`;

  /**
   * 지정된 S3 버킷과 임시 Key에 객체를 업로드할 수 있는
   * PutObject 명령을 생성한다.
   */
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: input.contentType,
  });

  /**
   * PutObject 명령을 제한된 시간 동안 사용할 수 있는
   * Presigned URL로 변환한다.
   */
  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: PROFILE_IMAGE_UPLOAD_URL_EXPIRES_IN,
  });

  return {
    uploadUrl,
    key,
    expiresIn: PROFILE_IMAGE_UPLOAD_URL_EXPIRES_IN,
  };
};

export const profileImageService = {
  createUploadUrl,
  validateUploadedImage,
  finalizeUploadedImage,
  deleteTemporaryImage,
  deleteProfileImage,
};
