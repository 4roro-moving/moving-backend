import type { MoveType } from "@prisma/client";

export interface CreateProfileInput {
  phone?: string;
  imageUrl?: string;
  regionIds: number[];
  serviceTypes: MoveType[];
}

export interface UpdateProfileInput {
  name?: string;
  phone?: string;

  currentPassword?: string;
  newPassword?: string;
  newPasswordConfirm?: string;

  imageUrl?: string | null;
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
  imageUrl: string | null;

  regions: {
    id: number;
    name: string;
  }[];

  serviceTypes: MoveType[];

  createdAt: Date;
  updatedAt: Date;
}
