import type {
  AuthProvider,
  Prisma,
  RefreshTokenRevokedReason,
  RefreshTokenSessionType,
} from "@prisma/client";

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
 *
 * 기존 Cleanup 정책은 expiresAt만을 기준으로 하므로
 * Token Family / revokedReason 추가 이후에도 동일하게 동작한다.
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
 *
 * Token Family가 적용된 신규 로그인 세션은
 * familyId를 함께 저장한다.
 *
 * 기존 마이그레이션 이전 Refresh Token은
 * familyId가 null일 수 있다.
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
 *
 * revokedAt 조건을 포함하지 않는 이유는
 * 이미 Rotation으로 폐기된 Refresh Token이 다시 전달되었는지
 * 확인하여 Reuse Detection에 활용해야 하기 때문이다.
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
 * 활성 Refresh Token 세션을 지정된 사유로 폐기한다.
 *
 * Rotation / Logout / 만료 / 강제 폐기 등의 원인을
 * revokedReason에 함께 기록한다.
 */
const revokeRefreshTokenByHash = async (
  tokenHash: string,
  sessionType: RefreshTokenSessionType,
  revokedReason: RefreshTokenRevokedReason,
  db: DbClient = prisma,
): Promise<Prisma.BatchPayload> => {
  return db.refreshToken.updateMany({
    where: {
      tokenHash,
      sessionType,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason,
    },
  });
};

/**
 * 특정 사용자의 지정된 세션 유형에 해당하는
 * 모든 활성 Refresh Token 세션을 지정된 사유로 폐기한다.
 *
 * 일반 사용자 세션과 관리자 세션의
 * 폐기 범위가 섞이지 않도록 sessionType을 조건에 포함한다.
 *
 * 비밀번호 변경 등 사용자의 전체 로그인 세션을
 * 강제로 종료해야 하는 경우 사용할 수 있다.
 */
const revokeAllRefreshTokensByUserId = async (
  userId: string,
  sessionType: RefreshTokenSessionType,
  revokedReason: RefreshTokenRevokedReason,
  db: DbClient = prisma,
): Promise<Prisma.BatchPayload> => {
  return db.refreshToken.updateMany({
    where: {
      userId,
      sessionType,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason,
    },
  });
};

/**
 * 동일 Token Family에 속한
 * 모든 활성 Refresh Token 세션을 지정된 사유로 폐기한다.
 *
 * Refresh Token Reuse가 감지된 경우
 * 사용자의 다른 로그인 세션까지 종료하지 않고,
 * 재사용이 발생한 Token Family만 폐기하기 위해 사용한다.
 *
 * USER / ADMIN 인증 세션의 폐기 범위가 섞이지 않도록
 * sessionType을 조건에 포함한다.
 *
 * 기존 마이그레이션 이전 Refresh Token은 familyId가 null이므로
 * 해당 토큰에는 Family 단위 폐기를 적용하지 않는다.
 */
const revokeRefreshTokenFamily = async (
  familyId: string,
  sessionType: RefreshTokenSessionType,
  revokedReason: RefreshTokenRevokedReason,
  db: DbClient = prisma,
): Promise<Prisma.BatchPayload> => {
  return db.refreshToken.updateMany({
    where: {
      familyId,
      sessionType,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason,
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
  revokeRefreshTokenFamily,
  deleteRefreshTokensExpiredBefore,
};
