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
 * DB에는 Refresh Token 원문을 저장하지 않으므로
 * 클라이언트가 전달한 토큰을 해싱한 후 조회해야 한다.
 */
const findRefreshTokenByHash = async (tokenHash: string, db: DbClient = prisma) => {
  return db.refreshToken.findUnique({
    where: {
      tokenHash,
    },
  });
};

/*
 * 전달된 tokenHash와 일치하는 Refresh Token을 삭제한다.
 *
 * delete가 아닌 deleteMany를 사용하여
 * 이미 삭제된 토큰이더라도 에러 없이 처리할 수 있게 한다.
 *
 * 반환되는 count를 사용하면 Refresh Token Rotation 시
 * 기존 토큰이 실제로 삭제됐는지 확인할 수 있다.
 */
const deleteRefreshTokenByHash = async (tokenHash: string, db: DbClient = prisma) => {
  return db.refreshToken.deleteMany({
    where: {
      tokenHash,
    },
  });
};

/*
 * 사용자의 모든 Refresh Token을 삭제한다.
 *
 * 비밀번호 변경, 계정 탈퇴, 전체 기기 로그아웃처럼
 * 모든 로그인 세션을 종료해야 할 때 사용할 수 있다.
 */
const deleteAllRefreshTokensByUserId = async (userId: string, db: DbClient = prisma) => {
  return db.refreshToken.deleteMany({
    where: {
      userId,
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
  deleteRefreshTokenByHash,
  deleteAllRefreshTokensByUserId,
};
