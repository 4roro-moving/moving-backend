import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  AuthProvider,
  RefreshTokenRevokedReason,
  RefreshTokenSessionType,
  UserRole,
} from "@prisma/client";

import "dotenv/config";

import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import { createRefreshToken } from "../../utils/jwt";
import { tokenHash } from "../../utils/tokenHash";
import { authRepository } from "./auth.repository";
import { authService } from "./auth.service";

const USER_ID = "user-reuse-before-rotation-1";
const FAMILY_A = "11111111-1111-4111-8111-111111111111";

const FUTURE_EXPIRES_AT = new Date("2099-01-01T00:00:00.000Z");
const REVOKED_USER_MESSAGE = "이미 사용되었거나 폐기된 Refresh Token입니다.";

type AuthUser = NonNullable<Awaited<ReturnType<typeof authRepository.findById>>>;

type StoredRefreshToken = {
  id: number;
  userId: string;
  tokenHash: string;
  sessionType: RefreshTokenSessionType;
  familyId: string | null;
  revokedReason: RefreshTokenRevokedReason | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SaveRefreshTokenInput = Parameters<typeof authRepository.saveRefreshToken>[0];

function createLocalUser(): AuthUser {
  return {
    id: USER_ID,
    email: "reuse-before-rotation@example.com",
    name: "Reuse Before Rotation User",
    phone: "01012345678",
    role: UserRole.CUSTOMER,
    authProvider: AuthProvider.LOCAL,
    providerUserId: null,
    password: "$2b$10$hash",
    isActive: true,
    isProfileCompleted: false,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    deletedAt: null,
  };
}

function createRefreshTokenStore(initialTokens: StoredRefreshToken[] = []) {
  const tokens = [...initialTokens];
  let nextId = tokens.length + 1;

  const findByHash = (hash: string, sessionType: RefreshTokenSessionType) =>
    tokens.find((token) => token.tokenHash === hash && token.sessionType === sessionType) ?? null;

  const revokeByHash = (
    hash: string,
    sessionType: RefreshTokenSessionType,
    revokedReason: RefreshTokenRevokedReason,
  ) => {
    let count = 0;

    for (const token of tokens) {
      if (
        token.tokenHash === hash &&
        token.sessionType === sessionType &&
        token.revokedAt === null
      ) {
        token.revokedAt = new Date("2026-08-14T03:00:00.000Z");
        token.revokedReason = revokedReason;
        count += 1;
      }
    }

    return { count };
  };

  const revokeFamily = (
    familyId: string,
    sessionType: RefreshTokenSessionType,
    revokedReason: RefreshTokenRevokedReason,
  ) => {
    let count = 0;

    for (const token of tokens) {
      if (
        token.familyId === familyId &&
        token.sessionType === sessionType &&
        token.revokedAt === null
      ) {
        token.revokedAt = new Date("2026-08-14T03:00:01.000Z");
        token.revokedReason = revokedReason;
        count += 1;
      }
    }

    return { count };
  };

  const saveToken = (data: SaveRefreshTokenInput) => {
    const record: StoredRefreshToken = {
      id: nextId,
      userId: data.userId,
      tokenHash: data.tokenHash,
      sessionType: data.sessionType ?? RefreshTokenSessionType.USER,
      familyId: data.familyId ?? null,
      revokedReason: null,
      expiresAt: data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt),
      revokedAt: null,
      createdAt: new Date("2026-08-14T03:00:02.000Z"),
      updatedAt: new Date("2026-08-14T03:00:02.000Z"),
    };

    nextId += 1;
    tokens.push(record);

    return record;
  };

  return {
    tokens,
    findByHash,
    revokeByHash,
    revokeFamily,
    saveToken,
  };
}

function getActiveFamilyTokens(
  store: ReturnType<typeof createRefreshTokenStore>,
  familyId: string,
  sessionType: RefreshTokenSessionType,
): StoredRefreshToken[] {
  return store.tokens.filter(
    (token) =>
      token.familyId === familyId && token.sessionType === sessionType && token.revokedAt === null,
  );
}

describe("authService refresh token reuse before rotation", () => {
  const originalFindRefreshTokenByHash = authRepository.findRefreshTokenByHash;
  const originalFindById = authRepository.findById;
  const originalRevokeRefreshTokenByHash = authRepository.revokeRefreshTokenByHash;
  const originalRevokeRefreshTokenFamily = authRepository.revokeRefreshTokenFamily;
  const originalSaveRefreshToken = authRepository.saveRefreshToken;
  const originalTransaction = prisma.$transaction;

  afterEach(() => {
    authRepository.findRefreshTokenByHash = originalFindRefreshTokenByHash;
    authRepository.findById = originalFindById;
    authRepository.revokeRefreshTokenByHash = originalRevokeRefreshTokenByHash;
    authRepository.revokeRefreshTokenFamily = originalRevokeRefreshTokenFamily;
    authRepository.saveRefreshToken = originalSaveRefreshToken;
    prisma.$transaction = originalTransaction;
  });

  it("does not leave an active token when reuse completes before R2 rotation starts", async () => {
    const refreshTokenR1 = createRefreshToken({ userId: USER_ID, role: UserRole.CUSTOMER });
    const refreshTokenR2 = createRefreshToken({ userId: USER_ID, role: UserRole.CUSTOMER });
    const refreshTokenR1Hash = tokenHash(refreshTokenR1);
    const refreshTokenR2Hash = tokenHash(refreshTokenR2);

    const store = createRefreshTokenStore([
      {
        id: 1,
        userId: USER_ID,
        tokenHash: refreshTokenR1Hash,
        sessionType: RefreshTokenSessionType.USER,
        familyId: FAMILY_A,
        revokedReason: RefreshTokenRevokedReason.ROTATED,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: new Date("2026-08-14T01:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: 2,
        userId: USER_ID,
        tokenHash: refreshTokenR2Hash,
        sessionType: RefreshTokenSessionType.USER,
        familyId: FAMILY_A,
        revokedReason: null,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    authRepository.findRefreshTokenByHash = async (hash, sessionType) =>
      store.findByHash(hash, sessionType);
    authRepository.findById = async () => createLocalUser();
    authRepository.revokeRefreshTokenByHash = async (hash, sessionType, revokedReason) =>
      store.revokeByHash(hash, sessionType, revokedReason);
    authRepository.revokeRefreshTokenFamily = async (familyId, sessionType, revokedReason) =>
      store.revokeFamily(familyId, sessionType, revokedReason);
    authRepository.saveRefreshToken = async (data) => store.saveToken(data);
    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    await assert.rejects(
      () => authService.refresh(refreshTokenR1),
      (error: unknown) => {
        assert.equal(error instanceof AppError, true);
        assert.equal((error as AppError).code, "UNAUTHORIZED");
        assert.equal((error as AppError).message, REVOKED_USER_MESSAGE);
        return true;
      },
    );

    const r2AfterReuse = store.tokens.find((token) => token.id === 2);
    assert.equal(r2AfterReuse?.revokedReason, RefreshTokenRevokedReason.REUSE_DETECTED);
    assert.notEqual(r2AfterReuse?.revokedAt, null);

    await assert.rejects(
      () => authService.refresh(refreshTokenR2),
      (error: unknown) => {
        assert.equal(error instanceof AppError, true);
        assert.equal((error as AppError).code, "UNAUTHORIZED");
        return true;
      },
    );

    assert.equal(getActiveFamilyTokens(store, FAMILY_A, RefreshTokenSessionType.USER).length, 0);
  });
});
