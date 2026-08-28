import type { MoveType } from "@prisma/client";

import { getProfileImageUrl } from "../../utils/image-url.js";

export const PROFILE_IMAGE_USER_ID = "profile-image-user-1";

export const PROFILE_IMAGE_TEMP_KEY = `temp/profiles/${PROFILE_IMAGE_USER_ID}/image-id.jpg`;
export const PROFILE_IMAGE_FINAL_KEY = `profiles/${PROFILE_IMAGE_USER_ID}/image-id.jpg`;
export const PROFILE_IMAGE_PREVIOUS_FINAL_KEY = `profiles/${PROFILE_IMAGE_USER_ID}/previous.jpg`;

export const PROFILE_IMAGE_LEGACY_FINAL_KEY = `profiles/${PROFILE_IMAGE_USER_ID}/legacy.webp`;

export function assertTempKeyFormat(key: string, userId: string): void {
  if (!key.startsWith(`temp/profiles/${userId}/`)) {
    throw new Error(`Expected temp key prefix for ${userId}, got ${key}`);
  }

  if (key.startsWith(`profiles/${userId}/`)) {
    throw new Error(`Key must not use final profiles prefix during upload: ${key}`);
  }

  const extension = key.split(".").at(-1);
  if (!extension || !["jpg", "png", "webp"].includes(extension)) {
    throw new Error(`Unexpected temp key extension: ${key}`);
  }
}

export function assertFinalKeyFormat(key: string, userId: string): void {
  if (!key.startsWith(`profiles/${userId}/`)) {
    throw new Error(`Expected final key prefix for ${userId}, got ${key}`);
  }

  if (key.startsWith("temp/")) {
    throw new Error(`Final key must not include temp prefix: ${key}`);
  }
}

export const customerCreateInput = {
  regionIds: [1],
  serviceTypes: ["HOME"] as MoveType[],
};

export function expectedProfileImageUrl(key: string | null): string | null {
  return getProfileImageUrl(key);
}

export const moverCreateInput = {
  nickname: "안전한기사",
  career: 5,
  shortIntro: "안전하게 운반합니다.",
  description: "고객님의 짐을 안전하게 운반하겠습니다.",
  activityBase: {
    address: "서울특별시 강남구 테헤란로 1",
    detailAddress: "101호",
    zipCode: "06234",
    latitude: 37.501,
    longitude: 127.039,
  },
  regionIds: [1],
  serviceTypes: ["HOME"] as MoveType[],
};
