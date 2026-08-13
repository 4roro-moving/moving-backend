import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import bcrypt from "bcrypt";
import { AuthProvider, UserRole } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { authRepository } from "./auth.repository";
import { authService } from "./auth.service";

const DUMMY_PASSWORD_HASH = "$2b$10$CxtIUUg2JDRWy.TYdu0y0e9bahGlNcJg2F78GaW9lRboxNL/OZpE6";
const REAL_PASSWORD_HASH = "$2b$10$real-user-password-hash-for-login-timing-test";

type CompareCall = {
  password: string;
  hash: string;
};

type CompareStubOptions = {
  resolve?: (password: string, hash: string) => boolean | Promise<boolean>;
};

function createCompareStub(options: CompareStubOptions = {}) {
  const calls: CompareCall[] = [];

  const compare = async (password: string, hash: string): Promise<boolean> => {
    calls.push({ password, hash });

    if (options.resolve) {
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

function assertAccountSuspended(error: unknown): boolean {
  return error instanceof AppError && error.code === "ACCOUNT_SUSPENDED";
}

function assertDeletedUserForbidden(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === "FORBIDDEN" &&
    error.message === "비활성화되었거나 탈퇴 처리된 계정입니다."
  );
}

type AuthUser = NonNullable<Awaited<ReturnType<typeof authRepository.findByEmail>>>;

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

describe("authService.login timing mitigation", () => {
  const originalFindByEmail = authRepository.findByEmail;
  const originalCompare = bcrypt.compare;

  afterEach(() => {
    authRepository.findByEmail = originalFindByEmail;
    bcrypt.compare = originalCompare;
  });

  it("calls bcrypt.compare with DUMMY_PASSWORD_HASH when email is not found", async () => {
    const { calls, compare } = createCompareStub();

    authRepository.findByEmail = async () => null;
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        authService.login({
          email: "missing@example.com",
          password: "wrong-password",
          role: UserRole.CUSTOMER,
        }),
      assertUnauthorized,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.password, "wrong-password");
    assert.equal(calls[0]?.hash, DUMMY_PASSWORD_HASH);
  });

  it("calls bcrypt.compare with DUMMY_PASSWORD_HASH for OAuth accounts on local login", async () => {
    const { calls, compare } = createCompareStub();

    authRepository.findByEmail = async () =>
      createLocalUser({
        authProvider: AuthProvider.GOOGLE,
        password: null,
      });
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        authService.login({
          email: "oauth-user@example.com",
          password: "wrong-password",
          role: UserRole.CUSTOMER,
        }),
      assertUnauthorized,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.hash, DUMMY_PASSWORD_HASH);
  });

  it("calls bcrypt.compare with the real password hash for LOCAL accounts with wrong password", async () => {
    const { calls, compare } = createCompareStub();

    authRepository.findByEmail = async () => createLocalUser();
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        authService.login({
          email: "user@example.com",
          password: "wrong-password",
          role: UserRole.CUSTOMER,
        }),
      assertUnauthorized,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.password, "wrong-password");
    assert.equal(calls[0]?.hash, REAL_PASSWORD_HASH);
  });

  it("returns UNAUTHORIZED instead of AUTH_ROLE_MISMATCH for wrong password with mismatched role", async () => {
    const { calls, compare } = createCompareStub();

    authRepository.findByEmail = async () => createLocalUser({ role: UserRole.CUSTOMER });
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        authService.login({
          email: "user@example.com",
          password: "wrong-password",
          role: UserRole.MOVER,
        }),
      (error: unknown) => {
        assert.equal(assertUnauthorized(error), true);
        assert.notEqual(error instanceof AppError && error.code, "AUTH_ROLE_MISMATCH");
        return true;
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.hash, REAL_PASSWORD_HASH);
  });

  it("keeps existing inactive or deleted user responses without bcrypt.compare", async () => {
    const inactiveCases = [
      {
        user: createLocalUser({ isActive: false }),
        assertError: assertAccountSuspended,
      },
      {
        user: createLocalUser({
          deletedAt: new Date("2026-08-01T00:00:00.000Z"),
        }),
        assertError: assertDeletedUserForbidden,
      },
    ];

    for (const { user, assertError } of inactiveCases) {
      const { calls, compare } = createCompareStub();

      authRepository.findByEmail = async () => user;
      bcrypt.compare = compare as typeof bcrypt.compare;

      await assert.rejects(
        () =>
          authService.login({
            email: user.email,
            password: "any-password",
            role: UserRole.CUSTOMER,
          }),
        assertError,
      );

      assert.equal(calls.length, 0);
    }
  });
});
