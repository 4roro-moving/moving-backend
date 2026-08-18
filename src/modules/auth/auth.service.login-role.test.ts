import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import bcrypt from "bcrypt";
import { AuthProvider, Prisma, RefreshTokenSessionType, UserRole } from "@prisma/client";

import "dotenv/config";

import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import { verifyAccessToken } from "../../utils/jwt";
import { authRepository } from "./auth.repository";
import { authService } from "./auth.service";
import type { OAuthProfile } from "./auth.type";
import { googleOAuth } from "./oauth/google.oauth";

const DUMMY_PASSWORD_HASH = "$2b$10$CxtIUUg2JDRWy.TYdu0y0e9bahGlNcJg2F78GaW9lRboxNL/OZpE6";
const REAL_PASSWORD_HASH = "$2b$10$real-user-password-hash-for-login-role-test";
const CORRECT_PASSWORD = "correct-password";
const WRONG_PASSWORD = "wrong-password";

const OAUTH_PROFILE: OAuthProfile = {
  provider: AuthProvider.GOOGLE,
  providerUserId: "google-sub-1",
  email: "oauth@example.com",
  name: "OAuth User",
  emailVerified: true,
};

type CompareCall = {
  password: string;
  hash: string;
};

type AuthUser = NonNullable<Awaited<ReturnType<typeof authRepository.findByEmail>>>;

type OAuthUser = NonNullable<
  Awaited<ReturnType<typeof authRepository.findByProviderAndProviderId>>
>;

function createCompareStub(options?: {
  resolve?: (password: string, hash: string) => boolean | Promise<boolean>;
}) {
  const calls: CompareCall[] = [];

  const compare = async (password: string, hash: string): Promise<boolean> => {
    calls.push({ password, hash });

    if (options?.resolve) {
      return options.resolve(password, hash);
    }

    return false;
  };

  return { calls, compare };
}

function assertUnauthorized(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === "UNAUTHORIZED" &&
    error.message === "이메일 또는 비밀번호가 올바르지 않습니다."
  );
}

function assertAuthRoleMismatch(error: unknown): boolean {
  return error instanceof AppError && error.code === "AUTH_ROLE_MISMATCH";
}

function createLocalUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
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

function createOAuthUser(overrides: Partial<OAuthUser> = {}): OAuthUser {
  return {
    id: "oauth-user-1",
    email: OAUTH_PROFILE.email,
    name: OAUTH_PROFILE.name,
    phone: null,
    role: UserRole.CUSTOMER,
    authProvider: AuthProvider.GOOGLE,
    providerUserId: OAUTH_PROFILE.providerUserId,
    password: null,
    isActive: true,
    isProfileCompleted: false,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

function createP2002Error(): Prisma.PrismaClientKnownRequestError {
  const error = Object.create(
    Prisma.PrismaClientKnownRequestError.prototype,
  ) as Prisma.PrismaClientKnownRequestError;

  Object.assign(error, {
    code: "P2002",
    meta: {},
  });

  return error;
}

function createSaveRefreshTokenStub() {
  let callCount = 0;

  const saveRefreshToken = async (data: Parameters<typeof authRepository.saveRefreshToken>[0]) => {
    callCount += 1;

    return {
      id: callCount,
      userId: data.userId,
      tokenHash: data.tokenHash,
      sessionType: data.sessionType ?? RefreshTokenSessionType.USER,
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
    saveRefreshToken,
  };
}

describe("authService.login role validation", () => {
  const originalFindByEmail = authRepository.findByEmail;
  const originalSaveRefreshToken = authRepository.saveRefreshToken;
  const originalCompare = bcrypt.compare;

  afterEach(() => {
    authRepository.findByEmail = originalFindByEmail;
    authRepository.saveRefreshToken = originalSaveRefreshToken;
    bcrypt.compare = originalCompare;
  });

  for (const role of [UserRole.CUSTOMER, UserRole.MOVER] as const) {
    it(`keeps successful login when DB role and requested role are both ${role}`, async () => {
      const user = createLocalUser({ role });
      const { calls, compare } = createCompareStub({
        resolve: (password, hash) => hash === REAL_PASSWORD_HASH && password === CORRECT_PASSWORD,
      });
      const refreshTokenStub = createSaveRefreshTokenStub();

      authRepository.findByEmail = async () => user;
      authRepository.saveRefreshToken = refreshTokenStub.saveRefreshToken;
      bcrypt.compare = compare as typeof bcrypt.compare;

      const result = await authService.login({
        email: user.email,
        password: CORRECT_PASSWORD,
        role,
      });

      assert.equal(result.user.role, role);
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.hash, REAL_PASSWORD_HASH);
      assert.equal(refreshTokenStub.callCount, 1);

      const accessTokenPayload = verifyAccessToken(result.tokens.accessToken);
      assert.equal(accessTokenPayload.role, role);
      assert.equal(accessTokenPayload.userId, user.id);
    });
  }

  it("returns AUTH_ROLE_MISMATCH when a CUSTOMER account logs in with the correct password and MOVER role", async () => {
    const { calls, compare } = createCompareStub({
      resolve: (password, hash) => hash === REAL_PASSWORD_HASH && password === CORRECT_PASSWORD,
    });
    const refreshTokenStub = createSaveRefreshTokenStub();

    authRepository.findByEmail = async () => createLocalUser({ role: UserRole.CUSTOMER });
    authRepository.saveRefreshToken = refreshTokenStub.saveRefreshToken;
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        authService.login({
          email: "user@example.com",
          password: CORRECT_PASSWORD,
          role: UserRole.MOVER,
        }),
      assertAuthRoleMismatch,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.hash, REAL_PASSWORD_HASH);
    assert.equal(refreshTokenStub.callCount, 0);
  });

  it("returns AUTH_ROLE_MISMATCH when a MOVER account logs in with the correct password and CUSTOMER role", async () => {
    const { calls, compare } = createCompareStub({
      resolve: (password, hash) => hash === REAL_PASSWORD_HASH && password === CORRECT_PASSWORD,
    });
    const refreshTokenStub = createSaveRefreshTokenStub();

    authRepository.findByEmail = async () => createLocalUser({ role: UserRole.MOVER });
    authRepository.saveRefreshToken = refreshTokenStub.saveRefreshToken;
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        authService.login({
          email: "user@example.com",
          password: CORRECT_PASSWORD,
          role: UserRole.CUSTOMER,
        }),
      assertAuthRoleMismatch,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.hash, REAL_PASSWORD_HASH);
    assert.equal(refreshTokenStub.callCount, 0);
  });

  for (const [dbRole, requestedRole] of [
    [UserRole.CUSTOMER, UserRole.MOVER],
    [UserRole.MOVER, UserRole.CUSTOMER],
  ] as const) {
    it(`returns UNAUTHORIZED instead of AUTH_ROLE_MISMATCH for ${dbRole} account with wrong password and ${requestedRole} role`, async () => {
      const { calls, compare } = createCompareStub();

      authRepository.findByEmail = async () => createLocalUser({ role: dbRole });
      bcrypt.compare = compare as typeof bcrypt.compare;

      await assert.rejects(
        () =>
          authService.login({
            email: "user@example.com",
            password: WRONG_PASSWORD,
            role: requestedRole,
          }),
        assertUnauthorized,
      );

      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.hash, REAL_PASSWORD_HASH);
    });
  }

  it("issues JWT with the DB role rather than a mismatched requested role on success", async () => {
    const user = createLocalUser({ role: UserRole.MOVER });
    const { compare } = createCompareStub({
      resolve: (password, hash) => hash === REAL_PASSWORD_HASH && password === CORRECT_PASSWORD,
    });
    const refreshTokenStub = createSaveRefreshTokenStub();

    authRepository.findByEmail = async () => user;
    authRepository.saveRefreshToken = refreshTokenStub.saveRefreshToken;
    bcrypt.compare = compare as typeof bcrypt.compare;

    const result = await authService.login({
      email: user.email,
      password: CORRECT_PASSWORD,
      role: UserRole.MOVER,
    });

    assert.equal(result.user.role, UserRole.MOVER);

    const accessTokenPayload = verifyAccessToken(result.tokens.accessToken);
    assert.equal(accessTokenPayload.role, UserRole.MOVER);
    assert.notEqual(accessTokenPayload.role, UserRole.CUSTOMER);
  });
});

describe("authService OAuth login role validation", () => {
  const originalGetGoogleOAuthProfile = googleOAuth.getGoogleOAuthProfile;
  const originalFindByProviderAndProviderId = authRepository.findByProviderAndProviderId;
  const originalFindByEmail = authRepository.findByEmail;
  const originalCreate = authRepository.create;
  const originalSaveRefreshToken = authRepository.saveRefreshToken;
  const originalTransaction = prisma.$transaction;

  afterEach(() => {
    googleOAuth.getGoogleOAuthProfile = originalGetGoogleOAuthProfile;
    authRepository.findByProviderAndProviderId = originalFindByProviderAndProviderId;
    authRepository.findByEmail = originalFindByEmail;
    authRepository.create = originalCreate;
    authRepository.saveRefreshToken = originalSaveRefreshToken;
    prisma.$transaction = originalTransaction;
  });

  function stubGoogleProfile(): void {
    googleOAuth.getGoogleOAuthProfile = async () => OAUTH_PROFILE;
  }

  for (const role of [UserRole.CUSTOMER, UserRole.MOVER] as const) {
    it(`keeps successful OAuth login when DB role and requested role are both ${role}`, async () => {
      stubGoogleProfile();

      const user = createOAuthUser({ role });
      const refreshTokenStub = createSaveRefreshTokenStub();

      authRepository.findByProviderAndProviderId = async () => user;
      authRepository.saveRefreshToken = refreshTokenStub.saveRefreshToken;

      const result = await authService.loginWithGoogle({
        code: "google-auth-code",
        role,
      });

      assert.equal(result.user.role, role);
      assert.equal(refreshTokenStub.callCount, 1);

      const accessTokenPayload = verifyAccessToken(result.tokens.accessToken);
      assert.equal(accessTokenPayload.role, role);
    });
  }

  it("returns AUTH_ROLE_MISMATCH when an existing CUSTOMER OAuth account logs in with MOVER role", async () => {
    stubGoogleProfile();

    const refreshTokenStub = createSaveRefreshTokenStub();

    authRepository.findByProviderAndProviderId = async () =>
      createOAuthUser({ role: UserRole.CUSTOMER });
    authRepository.saveRefreshToken = refreshTokenStub.saveRefreshToken;

    await assert.rejects(
      () =>
        authService.loginWithGoogle({
          code: "google-auth-code",
          role: UserRole.MOVER,
        }),
      assertAuthRoleMismatch,
    );

    assert.equal(refreshTokenStub.callCount, 0);
  });

  it("returns AUTH_ROLE_MISMATCH when an existing MOVER OAuth account logs in with CUSTOMER role", async () => {
    stubGoogleProfile();

    const refreshTokenStub = createSaveRefreshTokenStub();

    authRepository.findByProviderAndProviderId = async () =>
      createOAuthUser({ role: UserRole.MOVER });
    authRepository.saveRefreshToken = refreshTokenStub.saveRefreshToken;

    await assert.rejects(
      () =>
        authService.loginWithGoogle({
          code: "google-auth-code",
          role: UserRole.CUSTOMER,
        }),
      assertAuthRoleMismatch,
    );

    assert.equal(refreshTokenStub.callCount, 0);
  });

  it("creates a new OAuth user with the requested role", async () => {
    stubGoogleProfile();

    const refreshTokenStub = createSaveRefreshTokenStub();
    let createdRole: UserRole | undefined;

    authRepository.findByProviderAndProviderId = async () => null;
    authRepository.findByEmail = async () => null;
    authRepository.create = async (data) => {
      createdRole = data.role as UserRole;

      return {
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
      };
    };
    authRepository.saveRefreshToken = refreshTokenStub.saveRefreshToken;
    prisma.$transaction = (async (callback: (tx: never) => Promise<unknown>) =>
      callback({} as never)) as unknown as typeof prisma.$transaction;

    const result = await authService.loginWithGoogle({
      code: "google-auth-code",
      role: UserRole.MOVER,
    });

    assert.equal(createdRole, UserRole.MOVER);
    assert.equal(result.user.role, UserRole.MOVER);
    assert.equal(refreshTokenStub.callCount, 1);
  });

  it("applies role validation after P2002 when the concurrent OAuth user role matches", async () => {
    stubGoogleProfile();

    const refreshTokenStub = createSaveRefreshTokenStub();
    let findByProviderCallCount = 0;

    authRepository.findByProviderAndProviderId = async () => {
      findByProviderCallCount += 1;

      if (findByProviderCallCount === 1) {
        return null;
      }

      return createOAuthUser({ role: UserRole.CUSTOMER });
    };
    authRepository.findByEmail = async () => null;
    authRepository.saveRefreshToken = refreshTokenStub.saveRefreshToken;
    prisma.$transaction = (async () => {
      throw createP2002Error();
    }) as unknown as typeof prisma.$transaction;

    const result = await authService.loginWithGoogle({
      code: "google-auth-code",
      role: UserRole.CUSTOMER,
    });

    assert.equal(findByProviderCallCount, 2);
    assert.equal(result.user.role, UserRole.CUSTOMER);
    assert.equal(refreshTokenStub.callCount, 1);
  });

  it("returns AUTH_ROLE_MISMATCH after P2002 when the concurrent OAuth user role does not match", async () => {
    stubGoogleProfile();

    const refreshTokenStub = createSaveRefreshTokenStub();
    let findByProviderCallCount = 0;

    authRepository.findByProviderAndProviderId = async () => {
      findByProviderCallCount += 1;

      if (findByProviderCallCount === 1) {
        return null;
      }

      return createOAuthUser({ role: UserRole.CUSTOMER });
    };
    authRepository.findByEmail = async () => null;
    authRepository.saveRefreshToken = refreshTokenStub.saveRefreshToken;
    prisma.$transaction = (async () => {
      throw createP2002Error();
    }) as unknown as typeof prisma.$transaction;

    await assert.rejects(
      () =>
        authService.loginWithGoogle({
          code: "google-auth-code",
          role: UserRole.MOVER,
        }),
      assertAuthRoleMismatch,
    );

    assert.equal(findByProviderCallCount, 2);
    assert.equal(refreshTokenStub.callCount, 0);
  });
});
