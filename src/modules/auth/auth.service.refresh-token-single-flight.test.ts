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
import { clearRefreshTokenRotationGraceCache } from "../../utils/refresh-token-rotation-grace-cache";
import { tokenHash } from "../../utils/tokenHash";
import { authRepository } from "./auth.repository";
import { authService } from "./auth.service";

const USER_ID = "user-single-flight-1";
const FAMILY_A = "11111111-1111-4111-8111-111111111111";
const FAMILY_B = "22222222-2222-4222-8222-222222222222";

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

type Deferred<T = void> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function waitForMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

function createLocalUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: USER_ID,
    email: "single-flight@example.com",
    name: "Single Flight User",
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

describe("authService refresh token single-flight", () => {
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

  it("performs one USER rotation and shares the same tokens for concurrent refresh requests", async () => {
    const refreshToken = createSessionRefreshToken();
    const store = createRefreshTokenStore([createActiveStoredToken(refreshToken)]);

    let revokeRotatedCount = 0;
    let saveCount = 0;
    let findByHashCount = 0;

    const rotationEntered = createDeferred<void>();
    const rotationRelease = createDeferred<void>();

    installRefreshRepository(store);

    authRepository.findRefreshTokenByHash = async (hash, sessionType) => {
      findByHashCount += 1;
      return store.findByHash(hash, sessionType);
    };

    authRepository.revokeRefreshTokenByHash = async (hash, sessionType, revokedReason) => {
      if (revokedReason === RefreshTokenRevokedReason.ROTATED) {
        revokeRotatedCount += 1;

        if (revokeRotatedCount === 1) {
          rotationEntered.resolve();
          await rotationRelease.promise;
        }
      }

      return store.revokeByHash(hash, sessionType, revokedReason);
    };

    authRepository.saveRefreshToken = async (data) => {
      saveCount += 1;
      return store.saveToken(data);
    };

    authRepository.findById = async () => createLocalUser();

    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const concurrentRefresh = Promise.all([
      authService.refresh(refreshToken),
      authService.refresh(refreshToken),
      authService.refresh(refreshToken),
    ]);

    await rotationEntered.promise;
    await waitForMicrotasks();
    rotationRelease.resolve();

    const results = await concurrentRefresh;

    assert.equal(revokeRotatedCount, 1);
    assert.equal(saveCount, 1);
    assert.equal(findByHashCount, 1);
    assert.equal(store.revokeFamilyCalls.length, 0);

    assert.equal(results[0].accessToken, results[1].accessToken);
    assert.equal(results[0].refreshToken, results[1].refreshToken);
    assert.equal(results[1].accessToken, results[2].accessToken);
    assert.equal(results[1].refreshToken, results[2].refreshToken);
  });

  it("does not trigger reuse detection during concurrent refresh of the same token", async () => {
    const refreshToken = createSessionRefreshToken();
    const store = createRefreshTokenStore([createActiveStoredToken(refreshToken)]);

    const rotationEntered = createDeferred<void>();
    const rotationRelease = createDeferred<void>();
    let revokeRotatedCount = 0;

    installRefreshRepository(store);

    authRepository.revokeRefreshTokenByHash = async (hash, sessionType, revokedReason) => {
      if (revokedReason === RefreshTokenRevokedReason.ROTATED) {
        revokeRotatedCount += 1;

        if (revokeRotatedCount === 1) {
          rotationEntered.resolve();
          await rotationRelease.promise;
        }
      }

      return store.revokeByHash(hash, sessionType, revokedReason);
    };

    authRepository.findById = async () => createLocalUser();

    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const concurrentRefresh = Promise.all([
      authService.refresh(refreshToken),
      authService.refresh(refreshToken),
    ]);

    await rotationEntered.promise;
    rotationRelease.resolve();

    const results = await concurrentRefresh;

    assert.equal(store.revokeFamilyCalls.length, 0);
    assert.ok(results.every((result) => typeof result.accessToken === "string"));
    assert.ok(results.every((result) => typeof result.refreshToken === "string"));
    assert.equal(results[0].refreshToken, results[1].refreshToken);
  });

  it("applies reuse detection after single-flight rotation completes and R1 is submitted again", async () => {
    process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = "30";

    const refreshTokenR1 = createSessionRefreshToken();
    const store = createRefreshTokenStore([createActiveStoredToken(refreshTokenR1)]);

    installRefreshRepository(store);
    authRepository.findById = async () => createLocalUser();

    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const [firstResult, secondResult] = await Promise.all([
      authService.refresh(refreshTokenR1),
      authService.refresh(refreshTokenR1),
    ]);

    assert.equal(firstResult.refreshToken, secondResult.refreshToken);
    assert.equal(store.revokeFamilyCalls.length, 0);

    const rotatedR1 = store.tokens.find((token) => token.tokenHash === tokenHash(refreshTokenR1));
    const activeR2 = store.tokens.find(
      (token) => token.tokenHash === tokenHash(firstResult.refreshToken),
    );

    assert.equal(rotatedR1?.revokedReason, RefreshTokenRevokedReason.ROTATED);
    assert.equal(activeR2?.revokedAt, null);

    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });

    await assert.rejects(
      () => authService.refresh(refreshTokenR1),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "UNAUTHORIZED" &&
        error.message === REVOKED_USER_MESSAGE,
    );

    assert.deepEqual(store.revokeFamilyCalls, [
      {
        familyId: FAMILY_A,
        sessionType: RefreshTokenSessionType.USER,
        revokedReason: RefreshTokenRevokedReason.REUSE_DETECTED,
      },
    ]);

    assert.equal(activeR2?.revokedReason, RefreshTokenRevokedReason.REUSE_DETECTED);
  });

  it("runs separate rotations for concurrent refresh requests with different tokens", async () => {
    const refreshTokenR1 = createSessionRefreshToken();
    const refreshTokenR2 = createSessionRefreshToken();

    const store = createRefreshTokenStore([
      createActiveStoredToken(refreshTokenR1, { id: 1, familyId: FAMILY_A }),
      createActiveStoredToken(refreshTokenR2, {
        id: 2,
        tokenHash: tokenHash(refreshTokenR2),
        familyId: FAMILY_B,
      }),
    ]);

    let revokeRotatedCount = 0;
    let saveCount = 0;
    let findByHashCount = 0;

    installRefreshRepository(store);

    authRepository.findRefreshTokenByHash = async (hash, sessionType) => {
      findByHashCount += 1;
      return store.findByHash(hash, sessionType);
    };

    authRepository.revokeRefreshTokenByHash = async (hash, sessionType, revokedReason) => {
      if (revokedReason === RefreshTokenRevokedReason.ROTATED) {
        revokeRotatedCount += 1;
      }

      return store.revokeByHash(hash, sessionType, revokedReason);
    };

    authRepository.saveRefreshToken = async (data) => {
      saveCount += 1;
      return store.saveToken(data);
    };

    authRepository.findById = async () => createLocalUser();

    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const [resultR1, resultR2] = await Promise.all([
      authService.refresh(refreshTokenR1),
      authService.refresh(refreshTokenR2),
    ]);

    assert.equal(revokeRotatedCount, 2);
    assert.equal(saveCount, 2);
    assert.equal(findByHashCount, 2);
    assert.notEqual(resultR1.refreshToken, resultR2.refreshToken);
    assert.notEqual(tokenHash(resultR1.refreshToken), tokenHash(resultR2.refreshToken));
  });
});
