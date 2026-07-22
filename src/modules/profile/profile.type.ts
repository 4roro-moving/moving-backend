import type { MoveType } from "@prisma/client";

export interface CreateProfileInput {
  imageUrl?: string;
  regionIds: number[];
  serviceTypes: MoveType[];
}

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  imageUrl?: string | null;
  regionIds?: number[];
  serviceTypes?: MoveType[];
}

export interface ProfileResponse {
  id: number;
  userId: string;
  name: string;
  phone: string | null;
  imageUrl: string | null;

  regions: {
    id: number;
    name: string;
  }[];

  serviceTypes: MoveType[];

  createdAt: Date;
  updatedAt: Date;
}
