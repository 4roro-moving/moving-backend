import { randomUUID } from "node:crypto";

import { HeadObjectCommand, PutObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { AppError } from "../../lib/app-error";
import { s3Client } from "../../lib/s3";

import type {
  CreateProfileImageUploadUrlInput,
  ProfileImageUploadUrlResponse,
} from "./profile-image.type";

const PROFILE_IMAGE_UPLOAD_URL_EXPIRES_IN = 180;
const PROFILE_IMAGE_MAX_SIZE = 2 * 1024 * 1024;

const ALLOWED_PROFILE_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const bucketName = process.env.AWS_S3_BUCKET;

if (!bucketName) {
  throw new Error("AWS_S3_BUCKET 환경변수가 설정되지 않았습니다.");
}

/*
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

/*
 * 전달받은 이미지 Key가 현재 로그인한 사용자의
 * 프로필 이미지 경로에 속하는지 확인한다.
 */
const validateImageKeyOwnership = (userId: string, key: string): void => {
  const expectedPrefix = `profiles/${userId}/`;

  if (!key.startsWith(expectedPrefix)) {
    throw new AppError("FORBIDDEN", {
      message: "본인의 프로필 이미지만 등록할 수 있습니다.",
    });
  }
};

/*
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

/*
 * 프로필에 저장하려는 이미지가 실제 S3에 존재하는지 확인하고,
 * 업로드된 객체의 MIME 타입과 크기를 검증한다.
 *
 * - undefined: 이미지 변경 없음
 * - null: 기존 이미지 삭제
 * - string: 소유권 및 S3 객체 검증
 */
const validateUploadedImage = async (
  userId: string,
  key: string | null | undefined,
): Promise<void> => {
  if (key === undefined || key === null) {
    return;
  }

  /*
   * S3 요청 전에 현재 사용자의 이미지 Key인지 먼저 확인한다.
   */
  validateImageKeyOwnership(userId, key);

  try {
    const metadata = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );

    /*
     * 실제 S3 객체의 Content-Type을 다시 확인한다.
     */
    if (!metadata.ContentType || !ALLOWED_PROFILE_IMAGE_CONTENT_TYPES.has(metadata.ContentType)) {
      throw new AppError("BAD_REQUEST", {
        message: "지원하지 않는 프로필 이미지 형식입니다.",
      });
    }

    /*
     * 비어 있는 파일은 프로필 이미지로 사용할 수 없다.
     */
    if (metadata.ContentLength === undefined || metadata.ContentLength <= 0) {
      throw new AppError("BAD_REQUEST", {
        message: "프로필 이미지 파일이 비어 있습니다.",
      });
    }

    /*
     * 실제 업로드된 객체도 최대 2MB까지만 허용한다.
     */
    if (metadata.ContentLength > PROFILE_IMAGE_MAX_SIZE) {
      throw new AppError("BAD_REQUEST", {
        message: "프로필 이미지는 2MB 이하만 사용할 수 있습니다.",
      });
    }
  } catch (error) {
    /*
     * 위에서 직접 발생시킨 비즈니스 에러는 그대로 전달한다.
     */
    if (error instanceof AppError) {
      throw error;
    }

    /*
     * Key 형식은 정상이어도 실제 S3 객체가 존재하지 않을 수 있다.
     */
    if (isS3ObjectNotFoundError(error)) {
      throw new AppError("BAD_REQUEST", {
        message: "업로드된 프로필 이미지를 찾을 수 없습니다.",
      });
    }

    /*
     * AWS 권한 문제나 S3 장애 등 예상하지 못한 오류는
     * 사용자 입력 오류로 변환하지 않고 상위 에러 처리기로 전달한다.
     */
    throw error;
  }
};

/*
 * 프로필 이미지 업로드에 사용할 Presigned URL을 생성한다.
 *
 * 프론트에서 파일 자체를 전달받지 않고,
 * 파일 정보만 검증한 뒤 S3 직접 업로드 권한을 발급한다.
 */
const createUploadUrl = async (
  userId: string,
  input: CreateProfileImageUploadUrlInput,
): Promise<ProfileImageUploadUrlResponse> => {
  const extension = getExtension(input.contentType);

  /*
   * 프론트에서 임의의 Key를 전달받지 않고,
   * 인증된 사용자 ID와 UUID를 기준으로 백엔드에서 생성한다.
   */
  const key = `profiles/${userId}/${randomUUID()}.${extension}`;

  /*
   * 지정된 S3 버킷과 Key에 객체를 업로드할 수 있는
   * PutObject 명령을 생성한다.
   */
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: input.contentType,
  });

  /*
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
};
