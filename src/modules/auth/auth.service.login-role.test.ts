import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import bcrypt from "bcrypt";
import { AuthProvider, RefreshTokenSessionType, UserRole } from "@prisma/client";

import "dotenv/config";

import { AppError } from "../../lib/app-error";
import { verifyAccessToken } from "../../utils/jwt";
import { authRepository } from "./auth.repository";
import { authService } from "./auth.service";

const DUMMY_PASSWORD_HASH = "$2b$10$CxtIUUg2JDRWy.TYdu0y0e9bahGlNcJg2F78GaW9lRboxNL/OZpE6";
const REAL_PASSWORD_HASH = "$2b$10$real-user-password-hash-for-login-role-test";
const CORRECT_PASSWORD = "correct-password";

type CompareCall = {
  password: string;
  hash: string;
};

type AuthUser = NonNullable<Awaited<ReturnType<typeof authRepository.findByEmail>>>;

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

      authRepository.findByEmail = async () => user;
      authRepository.saveRefreshToken = async (data) => ({
        id: 1,
        userId: data.userId,
        tokenHash: data.tokenHash,
        sessionType: data.sessionType ?? RefreshTokenSessionType.USER,
        expiresAt: data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt),
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      bcrypt.compare = compare as typeof bcrypt.compare;

      const result = await authService.login({
        email: user.email,
        password: CORRECT_PASSWORD,
        role,
      });

      assert.equal(result.user.role, role);
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.hash, REAL_PASSWORD_HASH);

      const accessTokenPayload = verifyAccessToken(result.tokens.accessToken);
      assert.equal(accessTokenPayload.role, role);
      assert.equal(accessTokenPayload.userId, user.id);
    });
  }

  it("returns UNAUTHORIZED when a CUSTOMER account logs in with MOVER role", async () => {
    const { calls, compare } = createCompareStub();

    authRepository.findByEmail = async () => createLocalUser({ role: UserRole.CUSTOMER });
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        authService.login({
          email: "user@example.com",
          password: CORRECT_PASSWORD,
          role: UserRole.MOVER,
        }),
      assertUnauthorized,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.hash, DUMMY_PASSWORD_HASH);
  });

  it("returns UNAUTHORIZED when a MOVER account logs in with CUSTOMER role", async () => {
    const { calls, compare } = createCompareStub();

    authRepository.findByEmail = async () => createLocalUser({ role: UserRole.MOVER });
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        authService.login({
          email: "user@example.com",
          password: CORRECT_PASSWORD,
          role: UserRole.CUSTOMER,
        }),
      assertUnauthorized,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.hash, DUMMY_PASSWORD_HASH);
  });

  it("issues JWT with the DB role rather than a mismatched requested role on success", async () => {
    const user = createLocalUser({ role: UserRole.MOVER });
    const { compare } = createCompareStub({
      resolve: (password, hash) => hash === REAL_PASSWORD_HASH && password === CORRECT_PASSWORD,
    });

    authRepository.findByEmail = async () => user;
    authRepository.saveRefreshToken = async (data) => ({
      id: 1,
      userId: data.userId,
      tokenHash: data.tokenHash,
      sessionType: RefreshTokenSessionType.USER,
      expiresAt: data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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
