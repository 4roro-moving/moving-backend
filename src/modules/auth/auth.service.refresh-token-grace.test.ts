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
import { clearRefreshTokenRotationGraceCache } from "../../utils/refresh-token-rotation-grace-cache";
import { createRefreshToken } from "../../utils/jwt";
import { tokenHash } from "../../utils/tokenHash";
import { authRepository } from "./auth.repository";
import { authService } from "./auth.service";

const USER_ID = "user-grace-1";
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

type RevokeFamilyCall = {
  familyId: string;
  sessionType: RefreshTokenSessionType;
  revokedReason: RefreshTokenRevokedReason;
};

function createLocalUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: USER_ID,
    email: "user-grace@example.com",
    name: "Grace User",
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
    ...overrides,
  };
}

function createRefreshTokenStore(initialTokens: StoredRefreshToken[] = []) {
  const tokens = [...initialTokens];
  let nextId = tokens.length + 1;
  const revokeFamilyCalls: RevokeFamilyCall[] = [];

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
        token.revokedAt = new Date("2026-08-14T01:00:00.000Z");
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
    revokeFamilyCalls.push({ familyId, sessionType, revokedReason });

    let count = 0;

    for (const token of tokens) {
      if (
        token.familyId === familyId &&
        token.sessionType === sessionType &&
        token.revokedAt === null
      ) {
        token.revokedAt = new Date("2026-08-14T01:00:01.000Z");
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
      createdAt: new Date("2026-08-14T01:00:00.000Z"),
      updatedAt: new Date("2026-08-14T01:00:00.000Z"),
    };

    nextId += 1;
    tokens.push(record);

    return record;
  };

  return {
    tokens,
    revokeFamilyCalls,
    findByHash,
    revokeByHash,
    revokeFamily,
    saveToken,
  };
}

function installRefreshRepository(store: ReturnType<typeof createRefreshTokenStore>): void {
  authRepository.findRefreshTokenByHash = async (hash, sessionType) =>
    store.findByHash(hash, sessionType);

  authRepository.revokeRefreshTokenByHash = async (hash, sessionType, revokedReason) =>
    store.revokeByHash(hash, sessionType, revokedReason);

  authRepository.revokeRefreshTokenFamily = async (familyId, sessionType, revokedReason) =>
    store.revokeFamily(familyId, sessionType, revokedReason);

  authRepository.saveRefreshToken = async (data) => store.saveToken(data);
}

function createSessionRefreshToken(): string {
  return createRefreshToken({ userId: USER_ID, role: UserRole.CUSTOMER });
}

function createActiveStoredToken(
  refreshToken: string,
  overrides: Partial<StoredRefreshToken> = {},
): StoredRefreshToken {
  return {
    id: 1,
    userId: USER_ID,
    tokenHash: tokenHash(refreshToken),
    sessionType: RefreshTokenSessionType.USER,
    familyId: FAMILY_A,
    revokedReason: null,
    expiresAt: FUTURE_EXPIRES_AT,
    revokedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function assertUserRefreshUnauthorized(error: unknown, message: string): void {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, "UNAUTHORIZED");
  assert.equal(error.message, message);
}

describe("authService refresh token rotation grace", () => {
  const originalFindRefreshTokenByHash = authRepository.findRefreshTokenByHash;
  const originalFindById = authRepository.findById;
  const originalRevokeRefreshTokenByHash = authRepository.revokeRefreshTokenByHash;
  const originalRevokeRefreshTokenFamily = authRepository.revokeRefreshTokenFamily;
  const originalSaveRefreshToken = authRepository.saveRefreshToken;
  const originalTransaction = prisma.$transaction;
  const originalGraceTtl = process.env.REFRESH_TOKEN_ROTATION_GRACE_MS;

  afterEach(() => {
    authRepository.findRefreshTokenByHash = originalFindRefreshTokenByHash;
    authRepository.findById = originalFindById;
    authRepository.revokeRefreshTokenByHash = originalRevokeRefreshTokenByHash;
    authRepository.revokeRefreshTokenFamily = originalRevokeRefreshTokenFamily;
    authRepository.saveRefreshToken = originalSaveRefreshToken;
    prisma.$transaction = originalTransaction;
    clearRefreshTokenRotationGraceCache();

    if (originalGraceTtl === undefined) {
      delete process.env.REFRESH_TOKEN_ROTATION_GRACE_MS;
    } else {
      process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = originalGraceTtl;
    }
  });

  it("reproduces reuse detection when R1 is retried after rotation with grace disabled", async () => {
    process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = "0";

    const r1 = createSessionRefreshToken();
    const store = createRefreshTokenStore([createActiveStoredToken(r1)]);

    installRefreshRepository(store);
    authRepository.findById = async () => createLocalUser();
    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const firstResult = await authService.refresh(r1);

    assert.ok(firstResult.accessToken);
    assert.ok(firstResult.refreshToken);

    const rotatedR1 = store.findByHash(tokenHash(r1), RefreshTokenSessionType.USER);
    assert.equal(rotatedR1?.revokedReason, RefreshTokenRevokedReason.ROTATED);

    const activeR2 = store.tokens.find(
      (token) => token.revokedAt === null && token.tokenHash !== tokenHash(r1),
    );
    assert.ok(activeR2);

    await assert.rejects(
      () => authService.refresh(r1),
      (error: unknown) => {
        assertUserRefreshUnauthorized(error, REVOKED_USER_MESSAGE);
        return true;
      },
    );

    assert.deepEqual(store.revokeFamilyCalls, [
      {
        familyId: FAMILY_A,
        sessionType: RefreshTokenSessionType.USER,
        revokedReason: RefreshTokenRevokedReason.REUSE_DETECTED,
      },
    ]);
    assert.equal(activeR2.revokedReason, RefreshTokenRevokedReason.REUSE_DETECTED);
  });

  it("returns the same rotation result when R1 is retried within grace TTL", async () => {
    process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = "5000";

    const r1 = createSessionRefreshToken();
    const store = createRefreshTokenStore([createActiveStoredToken(r1)]);

    installRefreshRepository(store);
    authRepository.findById = async () => createLocalUser();
    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const firstResult = await authService.refresh(r1);
    const secondResult = await authService.refresh(r1);

    assert.deepEqual(secondResult, firstResult);
    assert.equal(store.revokeFamilyCalls.length, 0);

    const activeTokens = store.tokens.filter((token) => token.revokedAt === null);
    assert.equal(activeTokens.length, 1);
  });

  it("triggers reuse detection when R1 is retried after grace TTL expires", async () => {
    process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = "30";

    const r1 = createSessionRefreshToken();
    const store = createRefreshTokenStore([createActiveStoredToken(r1)]);

    installRefreshRepository(store);
    authRepository.findById = async () => createLocalUser();
    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    await authService.refresh(r1);

    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });

    await assert.rejects(
      () => authService.refresh(r1),
      (error: unknown) => {
        assertUserRefreshUnauthorized(error, REVOKED_USER_MESSAGE);
        return true;
      },
    );

    assert.deepEqual(store.revokeFamilyCalls, [
      {
        familyId: FAMILY_A,
        sessionType: RefreshTokenSessionType.USER,
        revokedReason: RefreshTokenRevokedReason.REUSE_DETECTED,
      },
    ]);
  });
});
