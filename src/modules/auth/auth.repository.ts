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
  return db.user.findFirst({
    where: {
      authProvider,
      providerUserId,
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

/*
 * HMAC-SHA256으로 해싱된 Refresh Token을 조회한다.
 *
 * revoke 여부까지 Service에서 확인할 수 있도록
 * tokenHash가 일치하는 레코드를 그대로 반환한다.
 */
const findRefreshTokenByHash = async (tokenHash: string, db: DbClient = prisma) => {
  return db.refreshToken.findUnique({
    where: {
      tokenHash,
    },
  });
};

/*
 * 아직 revoke되지 않은 Refresh Token을 폐기한다.
 *
 * updateMany를 사용하므로 이미 revoke되었거나
 * 존재하지 않는 토큰이어도 에러가 발생하지 않는다.
 *
 * Refresh Token Rotation에서는 반환되는 count를 확인하여
 * 동일한 토큰으로 동시에 재발급하는 요청 중
 * 하나의 요청만 성공하도록 한다.
 */
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

/*
 * 사용자의 아직 revoke되지 않은 모든 Refresh Token을 폐기한다.
 *
 * 비밀번호 변경, 계정 탈퇴, 전체 기기 로그아웃처럼
 * 모든 로그인 세션을 종료해야 할 때 사용할 수 있다.
 */
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
