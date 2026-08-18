import type { MoveType } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

interface CreateCustomerProfileData {
  imageUrl?: string;
  regionIds: number[];
  serviceTypes: MoveType[];
}

interface UpdateUserData {
  name?: string;
  phone?: string;
  password?: string;
}

interface UpdateCustomerProfileData {
  imageUrl?: string | null;
}

const profileInclude = {
  user: {
    select: {
      name: true,
      email: true,
      phone: true,
    },
  },
  serviceAreas: {
    include: {
      region: true,
    },
    orderBy: {
      regionId: "asc",
    },
  },
  serviceTypes: {
    orderBy: {
      id: "asc",
    },
  },
} as const;

const findUserById = async (userId: string, db: DbClient = prisma) => {
  return db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      isProfileCompleted: true,
      deletedAt: true,
    },
  });
};

const findUserWithPasswordById = async (userId: string, db: DbClient = prisma) => {
  return db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      password: true,
      role: true,
      isActive: true,
      isProfileCompleted: true,
      deletedAt: true,
    },
  });
};

const hasPasswordByUserId = async (userId: string, db: DbClient = prisma): Promise<boolean> => {
  const user = await db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      password: true,
    },
  });

  return user?.password !== null;
};

const findUserByPhoneExcludingUser = async (
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

const findProfileByUserId = async (userId: string, db: DbClient = prisma) => {
  return db.customerProfile.findUnique({
    where: {
      userId,
    },
    include: profileInclude,
  });
};

const countRegionsByIds = async (regionIds: number[], db: DbClient = prisma): Promise<number> => {
  return db.region.count({
    where: {
      id: {
        in: regionIds,
      },
    },
  });
};

const createProfile = async (
  userId: string,
  input: CreateCustomerProfileData,
  db: DbClient = prisma,
) => {
  return db.customerProfile.create({
    data: {
      userId,

      ...(input.imageUrl !== undefined && {
        imageUrl: input.imageUrl,
      }),

      serviceAreas: {
        create: input.regionIds.map((regionId) => ({
          regionId,
        })),
      },

      serviceTypes: {
        create: input.serviceTypes.map((moveType) => ({
          moveType,
        })),
      },
    },
    include: profileInclude,
  });
};

const updateUser = async (userId: string, data: UpdateUserData, db: DbClient = prisma) => {
  return db.user.update({
    where: {
      id: userId,
    },
    data: {
      ...(data.name !== undefined && {
        name: data.name,
      }),

      ...(data.phone !== undefined && {
        phone: data.phone,
      }),

      ...(data.password !== undefined && {
        password: data.password,
      }),
    },
  });
};

const updateProfile = async (
  userId: string,
  data: UpdateCustomerProfileData,
  db: DbClient = prisma,
) => {
  return db.customerProfile.update({
    where: {
      userId,
    },
    data: {
      ...(data.imageUrl !== undefined && {
        imageUrl: data.imageUrl,
      }),
    },
  });
};

const replaceServiceAreas = async (
  customerProfileId: number,
  regionIds: number[],
  db: DbClient = prisma,
): Promise<void> => {
  await db.customerServiceArea.deleteMany({
    where: {
      customerProfileId,
    },
  });

  await db.customerServiceArea.createMany({
    data: regionIds.map((regionId) => ({
      customerProfileId,
      regionId,
    })),
  });
};

const replaceServiceTypes = async (
  customerProfileId: number,
  serviceTypes: MoveType[],
  db: DbClient = prisma,
): Promise<void> => {
  await db.customerServiceType.deleteMany({
    where: {
      customerProfileId,
    },
  });

  await db.customerServiceType.createMany({
    data: serviceTypes.map((moveType) => ({
      customerProfileId,
      moveType,
    })),
  });
};

const markProfileCompleted = async (userId: string, db: DbClient = prisma) => {
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
  findUserWithPasswordById,
  hasPasswordByUserId,
  findUserByPhoneExcludingUser,
  findProfileByUserId,
  countRegionsByIds,
  createProfile,
  updateUser,
  updateProfile,
  replaceServiceAreas,
  replaceServiceTypes,
  markProfileCompleted,
};
