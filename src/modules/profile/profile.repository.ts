import type { MoveType, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

const profileInclude = {
  user: {
    select: {
      name: true,
      phone: true,
    },
  },
  serviceAreas: {
    select: {
      region: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  serviceTypes: {
    select: {
      moveType: true,
    },
  },
} satisfies Prisma.CustomerProfileInclude;

export interface CreateProfileData {
  userId: string;
  imageUrl?: string;
  regionIds: number[];
  serviceTypes: MoveType[];
}

export interface UpdateUserData {
  name?: string;
  phone?: string;
}

export const findUserById = async (userId: string, db: DbClient = prisma) => {
  return db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      isProfileCompleted: true,
      deletedAt: true,
    },
  });
};

export const findUserByPhoneExcludingUser = async (
  phone: string,
  userId: string,
  db: DbClient = prisma,
) => {
  return db.user.findFirst({
    where: {
      phone,
      id: {
        not: userId,
      },
    },
    select: {
      id: true,
    },
  });
};

export const findProfileByUserId = async (userId: string, db: DbClient = prisma) => {
  return db.customerProfile.findUnique({
    where: {
      userId,
    },
    include: profileInclude,
  });
};

export const countRegionsByIds = async (regionIds: number[], db: DbClient = prisma) => {
  return db.region.count({
    where: {
      id: {
        in: regionIds,
      },
    },
  });
};

export const createProfile = async (data: CreateProfileData, db: DbClient = prisma) => {
  const { userId, imageUrl, regionIds, serviceTypes } = data;

  return db.customerProfile.create({
    data: {
      userId,
      ...(imageUrl !== undefined && {
        imageUrl,
      }),
      serviceAreas: {
        create: regionIds.map((regionId) => ({
          regionId,
        })),
      },
      serviceTypes: {
        create: serviceTypes.map((moveType) => ({
          moveType,
        })),
      },
    },
    include: profileInclude,
  });
};

export const updateUser = async (userId: string, data: UpdateUserData, db: DbClient = prisma) => {
  const { name, phone } = data;

  return db.user.update({
    where: {
      id: userId,
    },
    data: {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
    },
  });
};

export const updateProfileImage = async (
  userId: string,
  imageUrl: string | null,
  db: DbClient = prisma,
) => {
  return db.customerProfile.update({
    where: {
      userId,
    },
    data: {
      imageUrl,
    },
  });
};

export const replaceServiceAreas = async (
  profileId: number,
  regionIds: number[],
  db: DbClient = prisma,
) => {
  await db.customerServiceArea.deleteMany({
    where: {
      customerProfileId: profileId,
    },
  });

  await db.customerServiceArea.createMany({
    data: regionIds.map((regionId) => ({
      customerProfileId: profileId,
      regionId,
    })),
  });
};

export const replaceServiceTypes = async (
  profileId: number,
  serviceTypes: MoveType[],
  db: DbClient = prisma,
) => {
  await db.customerServiceType.deleteMany({
    where: {
      customerProfileId: profileId,
    },
  });

  await db.customerServiceType.createMany({
    data: serviceTypes.map((moveType) => ({
      customerProfileId: profileId,
      moveType,
    })),
  });
};

export const markProfileCompleted = async (userId: string, db: DbClient = prisma) => {
  return db.user.update({
    where: {
      id: userId,
    },
    data: {
      isProfileCompleted: true,
    },
  });
};

export const profileRepository = {
  findUserById,
  findUserByPhoneExcludingUser,
  findProfileByUserId,
  countRegionsByIds,
  createProfile,
  updateUser,
  updateProfileImage,
  replaceServiceAreas,
  replaceServiceTypes,
  markProfileCompleted,
};
