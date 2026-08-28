import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import bcrypt from "bcrypt";
import {
  AuthProvider,
  RefreshTokenRevokedReason,
  RefreshTokenSessionType,
  UserRole,
} from "@prisma/client";

import "dotenv/config";

import { AppError } from "../../../lib/app-error";
import { prisma } from "../../../lib/prisma";
import { createRefreshToken } from "../../../utils/jwt";
import { tokenHash } from "../../../utils/tokenHash";
import { authRepository } from "../../auth/auth.repository";
import { adminAuthRepository } from "./admin-auth.repository";
import { adminAuthService } from "./admin-auth.service";

const REAL_PASSWORD_HASH = "$2b$10$real-admin-password-hash-for-token-family-test";
const CORRECT_PASSWORD = "correct-password";

const ADMIN_ID = "admin-1";
const FAMILY_A = "11111111-1111-4111-8111-111111111111";
const FAMILY_B = "22222222-2222-4222-8222-222222222222";

const FUTURE_EXPIRES_AT = new Date("2099-01-01T00:00:00.000Z");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REVOKED_ADMIN_MESSAGE = "이미 사용되었거나 폐기된 관리자 Refresh Token입니다.";

type AdminLoginUser = NonNullable<
  Awaited<ReturnType<typeof adminAuthRepository.findByEmailForLogin>>
>;

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

function createAdminLoginUser(overrides: Partial<AdminLoginUser> = {}): AdminLoginUser {
  return {
    id: ADMIN_ID,
    email: "admin@example.com",
    name: "관리자",
    role: UserRole.ADMIN,
    authProvider: AuthProvider.LOCAL,
    password: REAL_PASSWORD_HASH,
    isActive: true,
    deletedAt: null,
    adminProfile: {
      adminRole: "ADMIN",
    },
    ...overrides,
  };
}

function createAdminSessionUser(overrides: Partial<AdminSessionUser> = {}): AdminSessionUser {
  return {
    id: ADMIN_ID,
    email: "admin@example.com",
    name: "관리자",
    role: UserRole.ADMIN,
    isActive: true,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    deletedAt: null,
    adminProfile: {
      adminRole: "ADMIN",
    },
    ...overrides,
  };
}

function createSaveRefreshTokenRecorder() {
  const savedPayloads: SaveRefreshTokenInput[] = [];
  let callCount = 0;

  const saveRefreshToken = async (data: SaveRefreshTokenInput) => {
    callCount += 1;
    savedPayloads.push(data);

    return {
      id: callCount,
      userId: data.userId,
      tokenHash: data.tokenHash,
      sessionType: data.sessionType ?? RefreshTokenSessionType.USER,
      familyId: data.familyId ?? null,
      revokedReason: null,
      expiresAt: data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  return {
    get callCount() {
      return callCount;
    },
    savedPayloads,
    saveRefreshToken,
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

  const revokeAllByUserId = (
    userId: string,
    sessionType: RefreshTokenSessionType,
    revokedReason: RefreshTokenRevokedReason,
  ) => {
    let count = 0;

    for (const token of tokens) {
      if (
        token.userId === userId &&
        token.sessionType === sessionType &&
        token.revokedAt === null
      ) {
        token.revokedAt = new Date("2026-08-14T01:00:02.000Z");
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
    revokeAllByUserId,
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

  authRepository.revokeAllRefreshTokensByUserId = async (userId, sessionType, revokedReason) =>
    store.revokeAllByUserId(userId, sessionType, revokedReason);

  authRepository.saveRefreshToken = async (data) => store.saveToken(data);
}

function createAdminRefreshToken(): string {
  return createRefreshToken({ userId: ADMIN_ID, role: UserRole.ADMIN });
}

function assertAdminRefreshUnauthorized(error: unknown, message: string): boolean {
  return error instanceof AppError && error.code === "UNAUTHORIZED" && error.message === message;
}

function assertNotReuseDetectedExternalCode(error: unknown): void {
  assert.notEqual(error instanceof AppError && error.code, "TOKEN_REUSE_DETECTED");
  assert.notEqual(error instanceof AppError && error.code, "REUSE_DETECTED");
}

describe("adminAuthService refresh token family on login", () => {
  const originalFindByEmailForLogin = adminAuthRepository.findByEmailForLogin;
  const originalSaveRefreshToken = authRepository.saveRefreshToken;
  const originalCompare = bcrypt.compare;

  afterEach(() => {
    adminAuthRepository.findByEmailForLogin = originalFindByEmailForLogin;
    authRepository.saveRefreshToken = originalSaveRefreshToken;
    bcrypt.compare = originalCompare;
  });

  it("stores a non-null familyId with ADMIN sessionType on successful admin login", async () => {
    const recorder = createSaveRefreshTokenRecorder();

    adminAuthRepository.findByEmailForLogin = async () => createAdminLoginUser();
    authRepository.saveRefreshToken = recorder.saveRefreshToken;
    bcrypt.compare = (async () => true) as typeof bcrypt.compare;

    await adminAuthService.login({
      email: "admin@example.com",
      password: CORRECT_PASSWORD,
    });

    assert.equal(recorder.callCount, 1);
    assert.equal(recorder.savedPayloads[0]?.sessionType, RefreshTokenSessionType.ADMIN);
    assert.match(recorder.savedPayloads[0]?.familyId ?? "", UUID_PATTERN);
  });

  it("assigns a different familyId for each new admin login session", async () => {
    const recorder = createSaveRefreshTokenRecorder();

    adminAuthRepository.findByEmailForLogin = async () => createAdminLoginUser();
    authRepository.saveRefreshToken = recorder.saveRefreshToken;
    bcrypt.compare = (async () => true) as typeof bcrypt.compare;

    await adminAuthService.login({
      email: "admin@example.com",
      password: CORRECT_PASSWORD,
    });
    await adminAuthService.login({
      email: "admin@example.com",
      password: CORRECT_PASSWORD,
    });

    assert.equal(recorder.callCount, 2);
    assert.equal(recorder.savedPayloads[0]?.sessionType, RefreshTokenSessionType.ADMIN);
    assert.equal(recorder.savedPayloads[1]?.sessionType, RefreshTokenSessionType.ADMIN);
    assert.notEqual(recorder.savedPayloads[0]?.familyId, recorder.savedPayloads[1]?.familyId);
  });
});

describe("adminAuthService refresh token rotation", () => {
  const originalFindRefreshTokenByHash = authRepository.findRefreshTokenByHash;
  const originalFindByIdForSession = adminAuthRepository.findByIdForSession;
  const originalRevokeRefreshTokenByHash = authRepository.revokeRefreshTokenByHash;
  const originalRevokeRefreshTokenFamily = authRepository.revokeRefreshTokenFamily;
  const originalRevokeAllRefreshTokensByUserId = authRepository.revokeAllRefreshTokensByUserId;
  const originalSaveRefreshToken = authRepository.saveRefreshToken;
  const originalTransaction = prisma.$transaction;

  afterEach(() => {
    authRepository.findRefreshTokenByHash = originalFindRefreshTokenByHash;
    adminAuthRepository.findByIdForSession = originalFindByIdForSession;
    authRepository.revokeRefreshTokenByHash = originalRevokeRefreshTokenByHash;
    authRepository.revokeRefreshTokenFamily = originalRevokeRefreshTokenFamily;
    authRepository.revokeAllRefreshTokensByUserId = originalRevokeAllRefreshTokensByUserId;
    authRepository.saveRefreshToken = originalSaveRefreshToken;
    prisma.$transaction = originalTransaction;
  });

  it("inherits the same familyId when rotating an active admin refresh token", async () => {
    const refreshToken = createAdminRefreshToken();
    const store = createRefreshTokenStore([
      {
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
      },
    ]);

    installRefreshRepository(store);
    adminAuthRepository.findByIdForSession = async () => createAdminSessionUser();
    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const result = await adminAuthService.refresh(refreshToken);

    const rotatedToken = store.tokens.find((token) => token.tokenHash === tokenHash(refreshToken));
    const nextToken = store.tokens.find(
      (token) => token.tokenHash === tokenHash(result.refreshToken),
    );

    assert.equal(rotatedToken?.revokedReason, RefreshTokenRevokedReason.ROTATED);
    assert.notEqual(rotatedToken?.revokedAt, null);
    assert.equal(nextToken?.familyId, FAMILY_A);
    assert.equal(nextToken?.sessionType, RefreshTokenSessionType.ADMIN);
  });
});

describe("adminAuthService refresh token reuse detection", () => {
  const originalFindRefreshTokenByHash = authRepository.findRefreshTokenByHash;
  const originalFindByIdForSession = adminAuthRepository.findByIdForSession;
  const originalRevokeRefreshTokenByHash = authRepository.revokeRefreshTokenByHash;
  const originalRevokeRefreshTokenFamily = authRepository.revokeRefreshTokenFamily;
  const originalRevokeAllRefreshTokensByUserId = authRepository.revokeAllRefreshTokensByUserId;
  const originalSaveRefreshToken = authRepository.saveRefreshToken;
  const originalTransaction = prisma.$transaction;

  afterEach(() => {
    authRepository.findRefreshTokenByHash = originalFindRefreshTokenByHash;
    adminAuthRepository.findByIdForSession = originalFindByIdForSession;
    authRepository.revokeRefreshTokenByHash = originalRevokeRefreshTokenByHash;
    authRepository.revokeRefreshTokenFamily = originalRevokeRefreshTokenFamily;
    authRepository.revokeAllRefreshTokensByUserId = originalRevokeAllRefreshTokensByUserId;
    authRepository.saveRefreshToken = originalSaveRefreshToken;
    prisma.$transaction = originalTransaction;
  });

  it("revokes the same ADMIN token family when a ROTATED admin refresh token is reused", async () => {
    const reusedRefreshToken = createAdminRefreshToken();
    const store = createRefreshTokenStore([
      {
        id: 1,
        userId: ADMIN_ID,
        tokenHash: tokenHash(reusedRefreshToken),
        sessionType: RefreshTokenSessionType.ADMIN,
        familyId: FAMILY_A,
        revokedReason: RefreshTokenRevokedReason.ROTATED,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: new Date("2026-08-14T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: 2,
        userId: ADMIN_ID,
        tokenHash: "active-admin-family-a-token-hash",
        sessionType: RefreshTokenSessionType.ADMIN,
        familyId: FAMILY_A,
        revokedReason: null,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: 3,
        userId: ADMIN_ID,
        tokenHash: "active-admin-family-b-token-hash",
        sessionType: RefreshTokenSessionType.ADMIN,
        familyId: FAMILY_B,
        revokedReason: null,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    installRefreshRepository(store);
    adminAuthRepository.findByIdForSession = async () => createAdminSessionUser();

    await assert.rejects(
      () => adminAuthService.refresh(reusedRefreshToken),
      (error: unknown) => {
        assertAdminRefreshUnauthorized(error, REVOKED_ADMIN_MESSAGE);
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

    const familyAActive = store.tokens.find((token) => token.id === 2);
    const familyBActive = store.tokens.find((token) => token.id === 3);

    assert.equal(familyAActive?.revokedReason, RefreshTokenRevokedReason.REUSE_DETECTED);
    assert.equal(familyBActive?.revokedAt, null);
  });

  it("returns UNAUTHORIZED without exposing a reuse-specific external error code", async () => {
    const reusedRefreshToken = createAdminRefreshToken();
    const store = createRefreshTokenStore([
      {
        id: 1,
        userId: ADMIN_ID,
        tokenHash: tokenHash(reusedRefreshToken),
        sessionType: RefreshTokenSessionType.ADMIN,
        familyId: FAMILY_A,
        revokedReason: RefreshTokenRevokedReason.ROTATED,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: new Date("2026-08-14T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    installRefreshRepository(store);
    adminAuthRepository.findByIdForSession = async () => createAdminSessionUser();

    await assert.rejects(
      () => adminAuthService.refresh(reusedRefreshToken),
      (error: unknown) => {
        assert.equal(error instanceof AppError, true);
        assert.equal((error as AppError).status, 401);
        assert.equal((error as AppError).code, "UNAUTHORIZED");
        assert.equal((error as AppError).message, REVOKED_ADMIN_MESSAGE);
        assertNotReuseDetectedExternalCode(error);
        return true;
      },
    );
  });
});

describe("adminAuthService refresh token reuse detection exclusions", () => {
  const originalFindRefreshTokenByHash = authRepository.findRefreshTokenByHash;
  const originalFindByIdForSession = adminAuthRepository.findByIdForSession;
  const originalRevokeRefreshTokenFamily = authRepository.revokeRefreshTokenFamily;

  afterEach(() => {
    authRepository.findRefreshTokenByHash = originalFindRefreshTokenByHash;
    adminAuthRepository.findByIdForSession = originalFindByIdForSession;
    authRepository.revokeRefreshTokenFamily = originalRevokeRefreshTokenFamily;
  });

  for (const revokedReason of [
    RefreshTokenRevokedReason.LOGOUT,
    RefreshTokenRevokedReason.FORCED,
    RefreshTokenRevokedReason.EXPIRED,
  ] as const) {
    it(`does not revoke an admin token family when a ${revokedReason} refresh token is submitted again`, async () => {
      const submittedRefreshToken = createAdminRefreshToken();
      let familyRevokeCalled = false;

      authRepository.findRefreshTokenByHash = async () => ({
        id: 1,
        userId: ADMIN_ID,
        tokenHash: tokenHash(submittedRefreshToken),
        sessionType: RefreshTokenSessionType.ADMIN,
        familyId: FAMILY_A,
        revokedReason,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: new Date("2026-08-14T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      });
      adminAuthRepository.findByIdForSession = async () => createAdminSessionUser();
      authRepository.revokeRefreshTokenFamily = async () => {
        familyRevokeCalled = true;
        return { count: 0 };
      };

      await assert.rejects(
        () => adminAuthService.refresh(submittedRefreshToken),
        (error: unknown) => assertAdminRefreshUnauthorized(error, REVOKED_ADMIN_MESSAGE),
      );

      assert.equal(familyRevokeCalled, false);
    });
  }
});

describe("adminAuthService legacy admin refresh tokens without familyId", () => {
  const originalFindRefreshTokenByHash = authRepository.findRefreshTokenByHash;
  const originalFindByIdForSession = adminAuthRepository.findByIdForSession;
  const originalRevokeRefreshTokenByHash = authRepository.revokeRefreshTokenByHash;
  const originalRevokeRefreshTokenFamily = authRepository.revokeRefreshTokenFamily;
  const originalRevokeAllRefreshTokensByUserId = authRepository.revokeAllRefreshTokensByUserId;
  const originalSaveRefreshToken = authRepository.saveRefreshToken;
  const originalTransaction = prisma.$transaction;

  afterEach(() => {
    authRepository.findRefreshTokenByHash = originalFindRefreshTokenByHash;
    adminAuthRepository.findByIdForSession = originalFindByIdForSession;
    authRepository.revokeRefreshTokenByHash = originalRevokeRefreshTokenByHash;
    authRepository.revokeRefreshTokenFamily = originalRevokeRefreshTokenFamily;
    authRepository.revokeAllRefreshTokensByUserId = originalRevokeAllRefreshTokensByUserId;
    authRepository.saveRefreshToken = originalSaveRefreshToken;
    prisma.$transaction = originalTransaction;
  });

  it("keeps familyId null when rotating a legacy active admin refresh token", async () => {
    const refreshToken = createAdminRefreshToken();
    const store = createRefreshTokenStore([
      {
        id: 1,
        userId: ADMIN_ID,
        tokenHash: tokenHash(refreshToken),
        sessionType: RefreshTokenSessionType.ADMIN,
        familyId: null,
        revokedReason: null,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    installRefreshRepository(store);
    adminAuthRepository.findByIdForSession = async () => createAdminSessionUser();
    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const result = await adminAuthService.refresh(refreshToken);

    const nextToken = store.tokens.find(
      (token) => token.tokenHash === tokenHash(result.refreshToken),
    );

    assert.equal(nextToken?.familyId, null);
  });

  it("does not run family reuse detection for a legacy ROTATED admin refresh token without familyId", async () => {
    const reusedRefreshToken = createAdminRefreshToken();
    let familyRevokeCalled = false;

    authRepository.findRefreshTokenByHash = async () => ({
      id: 1,
      userId: ADMIN_ID,
      tokenHash: tokenHash(reusedRefreshToken),
      sessionType: RefreshTokenSessionType.ADMIN,
      familyId: null,
      revokedReason: RefreshTokenRevokedReason.ROTATED,
      expiresAt: FUTURE_EXPIRES_AT,
      revokedAt: new Date("2026-08-14T00:00:00.000Z"),
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    adminAuthRepository.findByIdForSession = async () => createAdminSessionUser();
    authRepository.revokeRefreshTokenFamily = async () => {
      familyRevokeCalled = true;
      return { count: 0 };
    };

    await assert.rejects(
      () => adminAuthService.refresh(reusedRefreshToken),
      (error: unknown) => assertAdminRefreshUnauthorized(error, REVOKED_ADMIN_MESSAGE),
    );

    assert.equal(familyRevokeCalled, false);
  });
});

describe("adminAuthService refresh token family session isolation", () => {
  const originalFindRefreshTokenByHash = authRepository.findRefreshTokenByHash;
  const originalFindByIdForSession = adminAuthRepository.findByIdForSession;
  const originalRevokeRefreshTokenFamily = authRepository.revokeRefreshTokenFamily;
  const originalRevokeRefreshTokenByHash = authRepository.revokeRefreshTokenByHash;
  const originalRevokeAllRefreshTokensByUserId = authRepository.revokeAllRefreshTokensByUserId;
  const originalSaveRefreshToken = authRepository.saveRefreshToken;

  afterEach(() => {
    authRepository.findRefreshTokenByHash = originalFindRefreshTokenByHash;
    adminAuthRepository.findByIdForSession = originalFindByIdForSession;
    authRepository.revokeRefreshTokenFamily = originalRevokeRefreshTokenFamily;
    authRepository.revokeRefreshTokenByHash = originalRevokeRefreshTokenByHash;
    authRepository.revokeAllRefreshTokensByUserId = originalRevokeAllRefreshTokensByUserId;
    authRepository.saveRefreshToken = originalSaveRefreshToken;
  });

  it("revokes only ADMIN sessions in the token family and leaves USER sessions untouched", async () => {
    const reusedRefreshToken = createAdminRefreshToken();
    const store = createRefreshTokenStore([
      {
        id: 1,
        userId: ADMIN_ID,
        tokenHash: tokenHash(reusedRefreshToken),
        sessionType: RefreshTokenSessionType.ADMIN,
        familyId: FAMILY_A,
        revokedReason: RefreshTokenRevokedReason.ROTATED,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: new Date("2026-08-14T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: 2,
        userId: ADMIN_ID,
        tokenHash: "active-admin-family-a-token-hash",
        sessionType: RefreshTokenSessionType.ADMIN,
        familyId: FAMILY_A,
        revokedReason: null,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: 3,
        userId: ADMIN_ID,
        tokenHash: "active-user-family-a-token-hash",
        sessionType: RefreshTokenSessionType.USER,
        familyId: FAMILY_A,
        revokedReason: null,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    installRefreshRepository(store);
    adminAuthRepository.findByIdForSession = async () => createAdminSessionUser();

    await assert.rejects(
      () => adminAuthService.refresh(reusedRefreshToken),
      (error: unknown) => assertAdminRefreshUnauthorized(error, REVOKED_ADMIN_MESSAGE),
    );

    const adminToken = store.tokens.find((token) => token.id === 2);
    const userToken = store.tokens.find((token) => token.id === 3);

    assert.equal(adminToken?.revokedReason, RefreshTokenRevokedReason.REUSE_DETECTED);
    assert.equal(userToken?.revokedAt, null);
    assert.deepEqual(store.revokeFamilyCalls[0], {
      familyId: FAMILY_A,
      sessionType: RefreshTokenSessionType.ADMIN,
      revokedReason: RefreshTokenRevokedReason.REUSE_DETECTED,
    });
  });
});

describe("adminAuthService inactive admin refresh policy", () => {
  const originalFindRefreshTokenByHash = authRepository.findRefreshTokenByHash;
  const originalFindByIdForSession = adminAuthRepository.findByIdForSession;
  const originalRevokeAllRefreshTokensByUserId = authRepository.revokeAllRefreshTokensByUserId;
  const originalRevokeRefreshTokenFamily = authRepository.revokeRefreshTokenFamily;

  afterEach(() => {
    authRepository.findRefreshTokenByHash = originalFindRefreshTokenByHash;
    adminAuthRepository.findByIdForSession = originalFindByIdForSession;
    authRepository.revokeAllRefreshTokensByUserId = originalRevokeAllRefreshTokensByUserId;
    authRepository.revokeRefreshTokenFamily = originalRevokeRefreshTokenFamily;
  });

  it("revokes all active ADMIN sessions with FORCED when an inactive admin attempts refresh", async () => {
    const refreshToken = createAdminRefreshToken();
    const store = createRefreshTokenStore([
      {
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
      },
      {
        id: 2,
        userId: ADMIN_ID,
        tokenHash: "other-active-admin-token-hash",
        sessionType: RefreshTokenSessionType.ADMIN,
        familyId: FAMILY_B,
        revokedReason: null,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    installRefreshRepository(store);
    adminAuthRepository.findByIdForSession = async () =>
      createAdminSessionUser({ isActive: false });

    await assert.rejects(
      () => adminAuthService.refresh(refreshToken),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "FORBIDDEN" &&
        error.message === "비활성화된 관리자 계정입니다.",
    );

    assert.equal(store.revokeFamilyCalls.length, 0);

    const activeAdminTokens = store.tokens.filter(
      (token) => token.sessionType === RefreshTokenSessionType.ADMIN,
    );

    assert.ok(
      activeAdminTokens.every((token) => token.revokedReason === RefreshTokenRevokedReason.FORCED),
    );
    assert.ok(activeAdminTokens.every((token) => token.revokedAt !== null));
  });
});
