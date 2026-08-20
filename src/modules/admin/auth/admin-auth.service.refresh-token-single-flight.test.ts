import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { RefreshTokenRevokedReason, RefreshTokenSessionType, UserRole } from "@prisma/client";

import "dotenv/config";

import { AppError } from "../../../lib/app-error";
import { prisma } from "../../../lib/prisma";
import { createRefreshToken } from "../../../utils/jwt";
import { clearRefreshTokenRotationGraceCache } from "../../../utils/refresh-token-rotation-grace-cache";
import { tokenHash } from "../../../utils/tokenHash";
import { authRepository } from "../../auth/auth.repository";
import { adminAuthRepository } from "./admin-auth.repository";
import { adminAuthService } from "./admin-auth.service";

const ADMIN_ID = "admin-single-flight-1";
const FAMILY_A = "11111111-1111-4111-8111-111111111111";
const FAMILY_B = "22222222-2222-4222-8222-222222222222";

const FUTURE_EXPIRES_AT = new Date("2099-01-01T00:00:00.000Z");

const REVOKED_ADMIN_MESSAGE = "이미 사용되었거나 폐기된 관리자 Refresh Token입니다.";

type AdminSessionUser = NonNullable<
  Awaited<ReturnType<typeof adminAuthRepository.findByIdForSession>>
>;

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

function createAdminSessionUser(overrides: Partial<AdminSessionUser> = {}): AdminSessionUser {
  return {
    id: ADMIN_ID,
    email: "admin-single-flight@example.com",
    name: "관리자",
    role: UserRole.ADMIN,
    isActive: true,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
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

function createAdminRefreshToken(): string {
  return createRefreshToken({ userId: ADMIN_ID, role: UserRole.ADMIN });
}

function createActiveStoredAdminToken(
  refreshToken: string,
  overrides: Partial<StoredRefreshToken> = {},
): StoredRefreshToken {
  return {
    id: 1,
    userId: ADMIN_ID,
    tokenHash: tokenHash(refreshToken),
    sessionType: RefreshTokenSessionType.ADMIN,
    familyId: FAMILY_A,
    revokedReason: null,
    expiresAt: FUTURE_EXPIRES_AT,
    revokedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function assertNotReuseDetectedExternalCode(error: unknown): void {
  assert.notEqual(error instanceof AppError && error.code, "TOKEN_REUSE_DETECTED");
  assert.notEqual(error instanceof AppError && error.code, "REUSE_DETECTED");
}

describe("adminAuthService refresh token single-flight", () => {
  const originalFindRefreshTokenByHash = authRepository.findRefreshTokenByHash;
  const originalFindByIdForSession = adminAuthRepository.findByIdForSession;
  const originalRevokeRefreshTokenByHash = authRepository.revokeRefreshTokenByHash;
  const originalRevokeRefreshTokenFamily = authRepository.revokeRefreshTokenFamily;
  const originalSaveRefreshToken = authRepository.saveRefreshToken;
  const originalTransaction = prisma.$transaction;
  const originalGraceTtl = process.env.REFRESH_TOKEN_ROTATION_GRACE_MS;

  afterEach(() => {
    authRepository.findRefreshTokenByHash = originalFindRefreshTokenByHash;
    adminAuthRepository.findByIdForSession = originalFindByIdForSession;
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

  it("performs one ADMIN rotation and shares the same tokens for concurrent refresh requests", async () => {
    const refreshToken = createAdminRefreshToken();
    const store = createRefreshTokenStore([createActiveStoredAdminToken(refreshToken)]);

    let revokeRotatedCount = 0;
    let saveCount = 0;
    let findByHashCount = 0;
    const rotatedRevokeSessionTypes: RefreshTokenSessionType[] = [];

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
        rotatedRevokeSessionTypes.push(sessionType);

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

    adminAuthRepository.findByIdForSession = async () => createAdminSessionUser();

    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const concurrentRefresh = Promise.all([
      adminAuthService.refresh(refreshToken),
      adminAuthService.refresh(refreshToken),
      adminAuthService.refresh(refreshToken),
    ]);

    await rotationEntered.promise;
    await waitForMicrotasks();
    rotationRelease.resolve();

    const results = await concurrentRefresh;

    assert.equal(revokeRotatedCount, 1);
    assert.equal(saveCount, 1);
    assert.equal(findByHashCount, 1);
    assert.equal(store.revokeFamilyCalls.length, 0);
    assert.deepEqual(rotatedRevokeSessionTypes, [RefreshTokenSessionType.ADMIN]);

    assert.equal(results[0].accessToken, results[1].accessToken);
    assert.equal(results[0].refreshToken, results[1].refreshToken);
    assert.equal(results[1].accessToken, results[2].accessToken);
    assert.equal(results[1].refreshToken, results[2].refreshToken);
  });

  it("does not trigger reuse detection during concurrent refresh of the same admin token", async () => {
    const refreshToken = createAdminRefreshToken();
    const store = createRefreshTokenStore([createActiveStoredAdminToken(refreshToken)]);

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

    adminAuthRepository.findByIdForSession = async () => createAdminSessionUser();

    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const concurrentRefresh = Promise.all([
      adminAuthService.refresh(refreshToken),
      adminAuthService.refresh(refreshToken),
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

    const refreshTokenR1 = createAdminRefreshToken();
    const store = createRefreshTokenStore([createActiveStoredAdminToken(refreshTokenR1)]);

    installRefreshRepository(store);
    adminAuthRepository.findByIdForSession = async () => createAdminSessionUser();

    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const [firstResult, secondResult, thirdResult] = await Promise.all([
      adminAuthService.refresh(refreshTokenR1),
      adminAuthService.refresh(refreshTokenR1),
      adminAuthService.refresh(refreshTokenR1),
    ]);

    assert.equal(firstResult.refreshToken, secondResult.refreshToken);
    assert.equal(secondResult.refreshToken, thirdResult.refreshToken);
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
      () => adminAuthService.refresh(refreshTokenR1),
      (error: unknown) => {
        assert.equal(error instanceof AppError, true);
        assert.equal((error as AppError).status, 401);
        assert.equal((error as AppError).code, "UNAUTHORIZED");
        assert.equal((error as AppError).message, REVOKED_ADMIN_MESSAGE);
        assertNotReuseDetectedExternalCode(error);
        return true;
      },
    );

    assert.deepEqual(store.revokeFamilyCalls, [
      {
        familyId: FAMILY_A,
        sessionType: RefreshTokenSessionType.ADMIN,
        revokedReason: RefreshTokenRevokedReason.REUSE_DETECTED,
      },
    ]);

    assert.equal(activeR2?.revokedReason, RefreshTokenRevokedReason.REUSE_DETECTED);
  });

  it("runs separate rotations for concurrent refresh requests with different admin tokens", async () => {
    const refreshTokenR1 = createAdminRefreshToken();
    const refreshTokenR2 = createAdminRefreshToken();

    const store = createRefreshTokenStore([
      createActiveStoredAdminToken(refreshTokenR1, { id: 1, familyId: FAMILY_A }),
      createActiveStoredAdminToken(refreshTokenR2, {
        id: 2,
        tokenHash: tokenHash(refreshTokenR2),
        familyId: FAMILY_B,
      }),
    ]);

    let revokeRotatedCount = 0;
    let saveCount = 0;
    let findByHashCount = 0;
    const rotatedRevokeSessionTypes: RefreshTokenSessionType[] = [];

    installRefreshRepository(store);

    authRepository.findRefreshTokenByHash = async (hash, sessionType) => {
      findByHashCount += 1;
      return store.findByHash(hash, sessionType);
    };

    authRepository.revokeRefreshTokenByHash = async (hash, sessionType, revokedReason) => {
      if (revokedReason === RefreshTokenRevokedReason.ROTATED) {
        revokeRotatedCount += 1;
        rotatedRevokeSessionTypes.push(sessionType);
      }

      return store.revokeByHash(hash, sessionType, revokedReason);
    };

    authRepository.saveRefreshToken = async (data) => {
      saveCount += 1;
      return store.saveToken(data);
    };

    adminAuthRepository.findByIdForSession = async () => createAdminSessionUser();

    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const [resultR1, resultR2] = await Promise.all([
      adminAuthService.refresh(refreshTokenR1),
      adminAuthService.refresh(refreshTokenR2),
    ]);

    assert.equal(revokeRotatedCount, 2);
    assert.equal(saveCount, 2);
    assert.equal(findByHashCount, 2);
    assert.deepEqual(rotatedRevokeSessionTypes, [
      RefreshTokenSessionType.ADMIN,
      RefreshTokenSessionType.ADMIN,
    ]);
    assert.notEqual(resultR1.refreshToken, resultR2.refreshToken);
    assert.notEqual(tokenHash(resultR1.refreshToken), tokenHash(resultR2.refreshToken));
  });
});
