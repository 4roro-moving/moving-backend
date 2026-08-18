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

const USER_ID = "user-reuse-race-1";
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

type Deferred<T = void> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
};

function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function waitForMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

function createLocalUser(): AuthUser {
  return {
    id: USER_ID,
    email: "reuse-race@example.com",
    name: "Reuse Race User",
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
        token.revokedAt = new Date("2026-08-14T02:00:00.000Z");
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
        token.revokedAt = new Date("2026-08-14T02:00:01.000Z");
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
      createdAt: new Date("2026-08-14T02:00:02.000Z"),
      updatedAt: new Date("2026-08-14T02:00:02.000Z"),
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

describe("authService refresh token reuse detection race condition", () => {
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

  it("does not leave an active refresh token when R1 reuse races with R2 rotation in the same family", async () => {
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

    const executionOrder: string[] = [];

    const familyRevokeReached = createDeferred<void>();
    const familyRevokeProceed = createDeferred<void>();
    const rotationSaveReached = createDeferred<void>();
    const rotationSaveProceed = createDeferred<void>();

    let r2RotatedInCurrentTransaction = false;

    authRepository.findRefreshTokenByHash = async (hash, sessionType) =>
      store.findByHash(hash, sessionType);

    authRepository.findById = async () => createLocalUser();

    authRepository.revokeRefreshTokenFamily = async (familyId, sessionType, revokedReason) => {
      executionOrder.push("R1: reuse confirmed ROTATED, entered revokeRefreshTokenFamily");
      familyRevokeReached.resolve();
      await familyRevokeProceed.promise;
      executionOrder.push("R1: revokeRefreshTokenFamily updateMany executing");
      const result = store.revokeFamily(familyId, sessionType, revokedReason);
      executionOrder.push(`R1: revokeRefreshTokenFamily completed (count=${result.count})`);
      return result;
    };

    authRepository.revokeRefreshTokenByHash = async (hash, sessionType, revokedReason) => {
      if (hash === refreshTokenR2Hash && revokedReason === RefreshTokenRevokedReason.ROTATED) {
        executionOrder.push("R2: rotation transaction revokeRefreshTokenByHash(ROTATED) executing");
      }

      const result = store.revokeByHash(hash, sessionType, revokedReason);

      if (hash === refreshTokenR2Hash && revokedReason === RefreshTokenRevokedReason.ROTATED) {
        r2RotatedInCurrentTransaction = result.count === 1;
        executionOrder.push(`R2: rotation transaction marked R2 ROTATED (count=${result.count})`);
      }

      return result;
    };

    authRepository.saveRefreshToken = async (data) => {
      if (r2RotatedInCurrentTransaction && data.familyId === FAMILY_A) {
        executionOrder.push("R2: rotation transaction reached saveRefreshToken before R3 insert");
        rotationSaveReached.resolve();
        await rotationSaveProceed.promise;
        executionOrder.push("R2: rotation transaction inserting R3");
        r2RotatedInCurrentTransaction = false;
      }

      return store.saveToken(data);
    };

    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) => {
      executionOrder.push("R2: rotation transaction started");
      return callback({} as never);
    }) as unknown as typeof prisma.$transaction;

    const r1ReusePromise = authService.refresh(refreshTokenR1);
    const r2RotationPromise = authService.refresh(refreshTokenR2);

    await familyRevokeReached.promise;
    await rotationSaveReached.promise;

    familyRevokeProceed.resolve();
    await waitForMicrotasks();
    rotationSaveProceed.resolve();

    const [r1Result, r2Result] = await Promise.allSettled([r1ReusePromise, r2RotationPromise]);

    executionOrder.push("both requests settled");

    assert.equal(r1Result.status, "rejected");
    if (r1Result.status === "rejected") {
      const error = r1Result.reason;
      assert.equal(error instanceof AppError, true);
      assert.equal((error as AppError).code, "UNAUTHORIZED");
      assert.equal((error as AppError).message, REVOKED_USER_MESSAGE);
    }

    const activeFamilyTokens = getActiveFamilyTokens(store, FAMILY_A, RefreshTokenSessionType.USER);

    assert.deepEqual(
      executionOrder,
      [
        "R1: reuse confirmed ROTATED, entered revokeRefreshTokenFamily",
        "R2: rotation transaction started",
        "R2: rotation transaction revokeRefreshTokenByHash(ROTATED) executing",
        "R2: rotation transaction marked R2 ROTATED (count=1)",
        "R2: rotation transaction reached saveRefreshToken before R3 insert",
        "R1: revokeRefreshTokenFamily updateMany executing",
        "R1: revokeRefreshTokenFamily completed (count=0)",
        "R2: rotation transaction inserting R3",
        "both requests settled",
      ],
      "unexpected interleaving; race reproduction order was not achieved",
    );

    assert.equal(
      activeFamilyTokens.length,
      0,
      `race left ${activeFamilyTokens.length} active USER refresh token(s) in family ${FAMILY_A}`,
    );

    if (r2Result.status === "fulfilled") {
      const issuedR3Hash = tokenHash(r2Result.value.refreshToken);
      const r3Record = store.tokens.find((token) => token.tokenHash === issuedR3Hash);
      assert.notEqual(r3Record, undefined);
      assert.notEqual(r3Record?.revokedAt, null);
    }
  });
});
