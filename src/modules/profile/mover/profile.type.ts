import type { MoveType } from "@prisma/client";

export interface MoverActivityBase {
  address: string;
  detailAddress?: string;
  zipCode: string;
  latitude: number;
  longitude: number;
}

export interface CreateProfileInput {
  phone?: string;

  nickname: string;
  imageUrl?: string;
  career: number;
  shortIntro: string;
  description: string;
  activityBase: MoverActivityBase;
  regionIds: number[];
  serviceTypes: MoveType[];
}

export interface UpdateBasicInfoInput {
  name?: string;
  phone?: string;
  currentPassword?: string;
  newPassword?: string;
  newPasswordConfirm?: string;
}

export interface UpdateProfileInput {
  nickname?: string;
  imageUrl?: string | null;
  career?: number;
  shortIntro?: string;
  description?: string;
  activityBase?: MoverActivityBase;
  regionIds?: number[];
  serviceTypes?: MoveType[];
}

export interface ProfileResponse {
  id: number;
  userId: string;

  name: string;
  email: string;
  phone: string | null;
  hasPassword: boolean;

  nickname: string;
  imageUrl: string | null;
  career: number;
  shortIntro: string;
  description: string;
  activityBase: MoverActivityBase | null;

  confirmedCount: number;
  averageRating: number;
  reviewCount: number;

  regions: {
    id: number;
    name: string;
  }[];

  serviceTypes: MoveType[];

  createdAt: Date;
  updatedAt: Date;
}

export interface MyProfileResponse extends ProfileResponse {
  completedCount: number;
}
