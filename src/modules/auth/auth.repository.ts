import type { AuthProvider, Prisma, RefreshTokenSessionType } from "@prisma/client";

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

/**
 * 기준 시각보다 오래 전에 만료된
 * Refresh Token 세션을 영구 삭제한다.
 */
const deleteRefreshTokensExpiredBefore = async (
  cutoff: Date,
  db: DbClient = prisma,
): Promise<Prisma.BatchPayload> => {
  return db.refreshToken.deleteMany({
    where: {
      expiresAt: {
        lt: cutoff,
      },
    },
  });
};

/**
 * Refresh Token 세션을 저장한다.
 *
 * sessionType은 호출부에서 USER 또는 ADMIN으로 지정한다.
 */
const saveRefreshToken = async (
  data: Prisma.RefreshTokenUncheckedCreateInput,
  db: DbClient = prisma,
) => {
  return db.refreshToken.create({
    data,
  });
};

/**
 * Token Hash와 세션 유형이 모두 일치하는
 * Refresh Token 세션을 조회한다.
 */
const findRefreshTokenByHash = async (
  tokenHash: string,
  sessionType: RefreshTokenSessionType,
  db: DbClient = prisma,
) => {
  return db.refreshToken.findFirst({
    where: {
      tokenHash,
      sessionType,
    },
  });
};

/**
 * Token Hash와 세션 유형이 모두 일치하는
 * 활성 Refresh Token 세션을 폐기한다.
 */
const revokeRefreshTokenByHash = async (
  tokenHash: string,
  sessionType: RefreshTokenSessionType,
  db: DbClient = prisma,
) => {
  return db.refreshToken.updateMany({
    where: {
      tokenHash,
      sessionType,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

/**
 * 특정 사용자의 지정된 세션 유형에 해당하는
 * 모든 활성 Refresh Token 세션을 폐기한다.
 *
 * 일반 사용자 세션과 관리자 세션의
 * 폐기 범위가 섞이지 않도록 sessionType을 조건에 포함한다.
 */
const revokeAllRefreshTokensByUserId = async (
  userId: string,
  sessionType: RefreshTokenSessionType,
  db: DbClient = prisma,
) => {
  return db.refreshToken.updateMany({
    where: {
      userId,
      sessionType,
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
  deleteRefreshTokensExpiredBefore,
};
