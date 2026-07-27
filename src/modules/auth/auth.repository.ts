import type { AuthProvider, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

const findByEmail = async (email: string, db: DbClient = prisma) => {
  return db.user.findUnique({
    where: {
      email,
    },
  });
};

const findById = async (id: string, db: DbClient = prisma) => {
  return db.user.findUnique({
    where: {
      id,
    },
  });
};

const findByProviderAndProviderId = async (
  authProvider: AuthProvider,
  providerUserId: string,
  db: DbClient = prisma,
) => {
  return db.user.findUnique({
    where: {
      authProvider_providerUserId: {
        authProvider,
        providerUserId,
      },
    },
  });
};

const create = async (data: Prisma.UserCreateInput, db: DbClient = prisma) => {
  return db.user.create({
    data,
  });
};

const update = async (id: string, data: Prisma.UserUpdateInput, db: DbClient = prisma) => {
  return db.user.update({
    where: {
      id,
    },
    data,
  });
};

const saveRefreshToken = async (
  data: Prisma.RefreshTokenUncheckedCreateInput,
  db: DbClient = prisma,
) => {
  return db.refreshToken.create({
    data,
  });
};

const findRefreshTokenByHash = async (tokenHash: string, db: DbClient = prisma) => {
  return db.refreshToken.findUnique({
    where: {
      tokenHash,
    },
  });
};

const revokeRefreshTokenByHash = async (tokenHash: string, db: DbClient = prisma) => {
  return db.refreshToken.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

const revokeAllRefreshTokensByUserId = async (userId: string, db: DbClient = prisma) => {
  return db.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

export const authRepository = {
  findByEmail,
  findById,
  findByProviderAndProviderId,
  create,
  update,
  saveRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshTokenByHash,
  revokeAllRefreshTokensByUserId,
};
