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

import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import { createRefreshToken } from "../../utils/jwt";
import { tokenHash } from "../../utils/tokenHash";
import { termsService } from "../terms/terms.service";
import { authRepository } from "./auth.repository";
import { authService } from "./auth.service";
import type { OAuthProfile } from "./auth.type";
import { googleOAuth } from "./oauth/google.oauth";

const REAL_PASSWORD_HASH = "$2b$10$real-user-password-hash-for-token-family-test";
const CORRECT_PASSWORD = "correct-password";

const USER_ID = "user-1";
const FAMILY_A = "11111111-1111-4111-8111-111111111111";
const FAMILY_B = "22222222-2222-4222-8222-222222222222";

const FUTURE_EXPIRES_AT = new Date("2099-01-01T00:00:00.000Z");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OAUTH_PROFILE: OAuthProfile = {
  provider: AuthProvider.GOOGLE,
  providerUserId: "google-sub-token-family",
  email: "oauth-family@example.com",
  name: "OAuth Family User",
  emailVerified: true,
};

type AuthUser = NonNullable<Awaited<ReturnType<typeof authRepository.findByEmail>>>;

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
    email: "user@example.com",
    name: "테스트 사용자",
    phone: "01012345678",
    role: UserRole.CUSTOMER,
    authProvider: AuthProvider.LOCAL,
    providerUserId: null,
    password: REAL_PASSWORD_HASH,
    isActive: true,
    isProfileCompleted: false,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    deletedAt: null,
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
        token.revokedAt = new Date("2026-08-13T12:00:00.000Z");
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
        token.revokedAt = new Date("2026-08-13T12:00:01.000Z");
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
      createdAt: new Date("2026-08-13T12:00:00.000Z"),
      updatedAt: new Date("2026-08-13T12:00:00.000Z"),
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

function createSessionRefreshToken(role: UserRole = UserRole.CUSTOMER): string {
  return createRefreshToken({ userId: USER_ID, role });
}

function assertRefreshUnauthorized(error: unknown, message: string): boolean {
  return error instanceof AppError && error.code === "UNAUTHORIZED" && error.message === message;
}

function assertNotReuseDetectedExternalCode(error: unknown): void {
  assert.notEqual(error instanceof AppError && error.code, "TOKEN_REUSE_DETECTED");
  assert.notEqual(error instanceof AppError && error.code, "REUSE_DETECTED");
}

describe("authService refresh token family on login", () => {
  const originalFindByEmail = authRepository.findByEmail;
  const originalFindByProviderAndProviderId = authRepository.findByProviderAndProviderId;
  const originalCreate = authRepository.create;
  const originalSaveRefreshToken = authRepository.saveRefreshToken;
  const originalCompare = bcrypt.compare;
  const originalGetGoogleOAuthProfile = googleOAuth.getGoogleOAuthProfile;
  const originalTransaction = prisma.$transaction;
  const originalSaveSignUpAgreements = termsService.saveSignUpAgreements;

  afterEach(() => {
    authRepository.findByEmail = originalFindByEmail;
    authRepository.findByProviderAndProviderId = originalFindByProviderAndProviderId;
    authRepository.create = originalCreate;
    authRepository.saveRefreshToken = originalSaveRefreshToken;
    bcrypt.compare = originalCompare;
    googleOAuth.getGoogleOAuthProfile = originalGetGoogleOAuthProfile;
    prisma.$transaction = originalTransaction;
    termsService.saveSignUpAgreements = originalSaveSignUpAgreements;
  });

  function installSuccessfulLocalLogin(role: UserRole) {
    const recorder = createSaveRefreshTokenRecorder();

    authRepository.findByEmail = async () => createLocalUser({ role });
    authRepository.saveRefreshToken = recorder.saveRefreshToken;
    bcrypt.compare = (async () => true) as typeof bcrypt.compare;

    return recorder;
  }

  for (const role of [UserRole.CUSTOMER, UserRole.MOVER] as const) {
    it(`stores a non-null familyId on LOCAL ${role} login`, async () => {
      const recorder = installSuccessfulLocalLogin(role);

      await authService.login({
        email: "user@example.com",
        password: CORRECT_PASSWORD,
        role,
      });

      assert.equal(recorder.callCount, 1);
      assert.match(recorder.savedPayloads[0]?.familyId ?? "", UUID_PATTERN);
    });
  }

  // 26.08.20 김나연 - [수정] 기존 OAuth 회원 로그인 요청에 intent 추가
  it("stores a non-null familyId on existing OAuth member login", async () => {
    const recorder = createSaveRefreshTokenRecorder();

    googleOAuth.getGoogleOAuthProfile = async () => OAUTH_PROFILE;
    authRepository.findByProviderAndProviderId = async () => ({
      ...createLocalUser({
        id: "oauth-user-1",
        email: OAUTH_PROFILE.email,
        authProvider: AuthProvider.GOOGLE,
        providerUserId: OAUTH_PROFILE.providerUserId,
        password: null,
      }),
    });
    authRepository.saveRefreshToken = recorder.saveRefreshToken;

    await authService.loginWithGoogle({
      code: "oauth-code",
      role: UserRole.CUSTOMER,
      intent: "login",
    });

    assert.equal(recorder.callCount, 1);
    assert.match(recorder.savedPayloads[0]?.familyId ?? "", UUID_PATTERN);
  });

  // 26.08.20 김나연 - [수정] 신규 OAuth 회원 생성 요청에 intent 추가
  it("stores a non-null familyId when creating a new OAuth member", async () => {
    const recorder = createSaveRefreshTokenRecorder();

    googleOAuth.getGoogleOAuthProfile = async () => OAUTH_PROFILE;
    authRepository.findByProviderAndProviderId = async () => null;
    authRepository.findByEmail = async () => null;
    authRepository.create = async (data) => ({
      id: "new-oauth-user",
      email: OAUTH_PROFILE.email,
      name: OAUTH_PROFILE.name,
      phone: null,
      role: data.role as UserRole,
      authProvider: AuthProvider.GOOGLE,
      providerUserId: OAUTH_PROFILE.providerUserId,
      password: null,
      isActive: true,
      isProfileCompleted: false,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      deletedAt: null,
    });
    authRepository.saveRefreshToken = recorder.saveRefreshToken;
    // 26.08.20 김나연 - [수정] signup intent 경로에서 약관 저장 stub 처리
    termsService.saveSignUpAgreements = async () => undefined;
    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    await authService.loginWithGoogle({
      code: "oauth-code",
      role: UserRole.MOVER,
      intent: "signup",
    });

    assert.equal(recorder.callCount, 1);
    assert.match(recorder.savedPayloads[0]?.familyId ?? "", UUID_PATTERN);
  });

  it("assigns a different familyId for each new login session", async () => {
    const recorder = createSaveRefreshTokenRecorder();

    authRepository.findByEmail = async () => createLocalUser({ role: UserRole.CUSTOMER });
    authRepository.saveRefreshToken = recorder.saveRefreshToken;
    bcrypt.compare = (async () => true) as typeof bcrypt.compare;

    await authService.login({
      email: "user@example.com",
      password: CORRECT_PASSWORD,
      role: UserRole.CUSTOMER,
    });
    await authService.login({
      email: "user@example.com",
      password: CORRECT_PASSWORD,
      role: UserRole.CUSTOMER,
    });

    assert.equal(recorder.callCount, 2);
    assert.notEqual(recorder.savedPayloads[0]?.familyId, recorder.savedPayloads[1]?.familyId);
  });
});

describe("authService refresh token rotation", () => {
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

  it("inherits the same familyId when rotating an active refresh token", async () => {
    const refreshToken = createSessionRefreshToken();
    const store = createRefreshTokenStore([
      {
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
      },
    ]);

    installRefreshRepository(store);
    authRepository.findById = async () => createLocalUser();
    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const result = await authService.refresh(refreshToken);

    const rotatedToken = store.tokens.find((token) => token.tokenHash === tokenHash(refreshToken));
    const nextToken = store.tokens.find(
      (token) => token.tokenHash === tokenHash(result.refreshToken),
    );

    assert.equal(rotatedToken?.revokedReason, RefreshTokenRevokedReason.ROTATED);
    assert.notEqual(rotatedToken?.revokedAt, null);
    assert.equal(nextToken?.familyId, FAMILY_A);
  });
});

describe("authService refresh token reuse detection", () => {
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

  it("revokes the same USER token family when a ROTATED refresh token is reused", async () => {
    const reusedRefreshToken = createSessionRefreshToken();
    const store = createRefreshTokenStore([
      {
        id: 1,
        userId: USER_ID,
        tokenHash: tokenHash(reusedRefreshToken),
        sessionType: RefreshTokenSessionType.USER,
        familyId: FAMILY_A,
        revokedReason: RefreshTokenRevokedReason.ROTATED,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: new Date("2026-08-13T11:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: 2,
        userId: USER_ID,
        tokenHash: "active-family-a-token-hash",
        sessionType: RefreshTokenSessionType.USER,
        familyId: FAMILY_A,
        revokedReason: null,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: 3,
        userId: USER_ID,
        tokenHash: "active-family-b-token-hash",
        sessionType: RefreshTokenSessionType.USER,
        familyId: FAMILY_B,
        revokedReason: null,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    installRefreshRepository(store);
    authRepository.findById = async () => createLocalUser();

    await assert.rejects(
      () => authService.refresh(reusedRefreshToken),
      (error: unknown) => {
        assertRefreshUnauthorized(error, "이미 사용되었거나 폐기된 Refresh Token입니다.");
        assertNotReuseDetectedExternalCode(error);
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

    const familyAActive = store.tokens.find((token) => token.id === 2);
    const familyBActive = store.tokens.find((token) => token.id === 3);

    assert.equal(familyAActive?.revokedReason, RefreshTokenRevokedReason.REUSE_DETECTED);
    assert.equal(familyBActive?.revokedAt, null);
  });

  it("returns UNAUTHORIZED without exposing a reuse-specific external error code", async () => {
    const reusedRefreshToken = createSessionRefreshToken();
    const store = createRefreshTokenStore([
      {
        id: 1,
        userId: USER_ID,
        tokenHash: tokenHash(reusedRefreshToken),
        sessionType: RefreshTokenSessionType.USER,
        familyId: FAMILY_A,
        revokedReason: RefreshTokenRevokedReason.ROTATED,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: new Date("2026-08-13T11:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    installRefreshRepository(store);
    authRepository.findById = async () => createLocalUser();

    await assert.rejects(
      () => authService.refresh(reusedRefreshToken),
      (error: unknown) => {
        assert.equal(error instanceof AppError, true);
        assert.equal((error as AppError).status, 401);
        assert.equal((error as AppError).code, "UNAUTHORIZED");
        assertNotReuseDetectedExternalCode(error);
        return true;
      },
    );
  });
});

describe("authService refresh token reuse detection exclusions", () => {
  const originalFindRefreshTokenByHash = authRepository.findRefreshTokenByHash;
  const originalFindById = authRepository.findById;
  const originalRevokeRefreshTokenFamily = authRepository.revokeRefreshTokenFamily;

  afterEach(() => {
    authRepository.findRefreshTokenByHash = originalFindRefreshTokenByHash;
    authRepository.findById = originalFindById;
    authRepository.revokeRefreshTokenFamily = originalRevokeRefreshTokenFamily;
  });

  for (const revokedReason of [
    RefreshTokenRevokedReason.LOGOUT,
    RefreshTokenRevokedReason.FORCED,
    RefreshTokenRevokedReason.EXPIRED,
  ] as const) {
    it(`does not revoke a token family when a ${revokedReason} refresh token is submitted again`, async () => {
      const submittedRefreshToken = createSessionRefreshToken();
      let familyRevokeCalled = false;

      authRepository.findRefreshTokenByHash = async () => ({
        id: 1,
        userId: USER_ID,
        tokenHash: tokenHash(submittedRefreshToken),
        sessionType: RefreshTokenSessionType.USER,
        familyId: FAMILY_A,
        revokedReason,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: new Date("2026-08-13T11:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      });
      authRepository.findById = async () => createLocalUser();
      authRepository.revokeRefreshTokenFamily = async () => {
        familyRevokeCalled = true;
        return { count: 0 };
      };

      await assert.rejects(
        () => authService.refresh(submittedRefreshToken),
        (error: unknown) => {
          assertRefreshUnauthorized(error, "이미 사용되었거나 폐기된 Refresh Token입니다.");
          return true;
        },
      );

      assert.equal(familyRevokeCalled, false);
    });
  }
});

describe("authService legacy refresh tokens without familyId", () => {
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

  it("keeps familyId null when rotating a legacy active refresh token", async () => {
    const refreshToken = createSessionRefreshToken();
    const store = createRefreshTokenStore([
      {
        id: 1,
        userId: USER_ID,
        tokenHash: tokenHash(refreshToken),
        sessionType: RefreshTokenSessionType.USER,
        familyId: null,
        revokedReason: null,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    installRefreshRepository(store);
    authRepository.findById = async () => createLocalUser();
    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const result = await authService.refresh(refreshToken);

    const nextToken = store.tokens.find(
      (token) => token.tokenHash === tokenHash(result.refreshToken),
    );

    assert.equal(nextToken?.familyId, null);
  });

  it("does not run family reuse detection for a legacy ROTATED refresh token without familyId", async () => {
    const reusedRefreshToken = createSessionRefreshToken();
    let familyRevokeCalled = false;

    authRepository.findRefreshTokenByHash = async () => ({
      id: 1,
      userId: USER_ID,
      tokenHash: tokenHash(reusedRefreshToken),
      sessionType: RefreshTokenSessionType.USER,
      familyId: null,
      revokedReason: RefreshTokenRevokedReason.ROTATED,
      expiresAt: FUTURE_EXPIRES_AT,
      revokedAt: new Date("2026-08-13T11:00:00.000Z"),
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    authRepository.findById = async () => createLocalUser();
    authRepository.revokeRefreshTokenFamily = async () => {
      familyRevokeCalled = true;
      return { count: 0 };
    };

    await assert.rejects(
      () => authService.refresh(reusedRefreshToken),
      (error: unknown) =>
        assertRefreshUnauthorized(error, "이미 사용되었거나 폐기된 Refresh Token입니다."),
    );

    assert.equal(familyRevokeCalled, false);
  });
});

describe("authService refresh token family session isolation", () => {
  const originalFindRefreshTokenByHash = authRepository.findRefreshTokenByHash;
  const originalFindById = authRepository.findById;
  const originalRevokeRefreshTokenFamily = authRepository.revokeRefreshTokenFamily;

  afterEach(() => {
    authRepository.findRefreshTokenByHash = originalFindRefreshTokenByHash;
    authRepository.findById = originalFindById;
    authRepository.revokeRefreshTokenFamily = originalRevokeRefreshTokenFamily;
  });

  it("revokes only USER sessions in the token family and leaves ADMIN sessions untouched", async () => {
    const reusedRefreshToken = createSessionRefreshToken();
    const store = createRefreshTokenStore([
      {
        id: 1,
        userId: USER_ID,
        tokenHash: tokenHash(reusedRefreshToken),
        sessionType: RefreshTokenSessionType.USER,
        familyId: FAMILY_A,
        revokedReason: RefreshTokenRevokedReason.ROTATED,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: new Date("2026-08-13T11:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: 2,
        userId: USER_ID,
        tokenHash: "active-user-family-a-token-hash",
        sessionType: RefreshTokenSessionType.USER,
        familyId: FAMILY_A,
        revokedReason: null,
        expiresAt: FUTURE_EXPIRES_AT,
        revokedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: 3,
        userId: USER_ID,
        tokenHash: "active-admin-family-a-token-hash",
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
    authRepository.findById = async () => createLocalUser();

    await assert.rejects(
      () => authService.refresh(reusedRefreshToken),
      (error: unknown) =>
        assertRefreshUnauthorized(error, "이미 사용되었거나 폐기된 Refresh Token입니다."),
    );

    const userToken = store.tokens.find((token) => token.id === 2);
    const adminToken = store.tokens.find((token) => token.id === 3);

    assert.equal(userToken?.revokedReason, RefreshTokenRevokedReason.REUSE_DETECTED);
    assert.equal(adminToken?.revokedAt, null);
    assert.deepEqual(store.revokeFamilyCalls[0], {
      familyId: FAMILY_A,
      sessionType: RefreshTokenSessionType.USER,
      revokedReason: RefreshTokenRevokedReason.REUSE_DETECTED,
    });
  });
});
