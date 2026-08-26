import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import bcrypt from "bcrypt";
import { AuthProvider, UserRole } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { adminAuthRepository } from "./admin-auth.repository";
import { adminAuthService } from "./admin-auth.service";

const DUMMY_PASSWORD_HASH = "$2b$10$CxtIUUg2JDRWy.TYdu0y0e9bahGlNcJg2F78GaW9lRboxNL/OZpE6";
const REAL_PASSWORD_HASH = "$2b$10$real-admin-password-hash-for-login-timing-test";

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

function assertInactiveAdminForbidden(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === "FORBIDDEN" &&
    error.message === "비활성화되었거나 탈퇴 처리된 관리자 계정입니다."
  );
}

function createAdminUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-1",
    email: "admin@example.com",
    name: "관리자",
    role: UserRole.ADMIN,
    authProvider: AuthProvider.LOCAL,
    password: REAL_PASSWORD_HASH,
    isActive: true,
    deletedAt: null,
    adminProfile: {
      adminRole: "ADMIN" as const,
    },
    ...overrides,
  };
}

describe("adminAuthService.login timing mitigation", () => {
  const originalFindByEmailForLogin = adminAuthRepository.findByEmailForLogin;
  const originalCompare = bcrypt.compare;

  afterEach(() => {
    adminAuthRepository.findByEmailForLogin = originalFindByEmailForLogin;
    bcrypt.compare = originalCompare;
  });

  it("calls bcrypt.compare with DUMMY_PASSWORD_HASH when email is not found", async () => {
    const { calls, compare } = createCompareStub();

    adminAuthRepository.findByEmailForLogin = async () => null;
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        adminAuthService.login({
          email: "missing-admin@example.com",
          password: "wrong-password",
        }),
      assertUnauthorized,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.password, "wrong-password");
    assert.equal(calls[0]?.hash, DUMMY_PASSWORD_HASH);
  });

  it("calls bcrypt.compare with DUMMY_PASSWORD_HASH when a non-admin role logs in", async () => {
    const { calls, compare } = createCompareStub();

    adminAuthRepository.findByEmailForLogin = async () =>
      createAdminUser({
        role: UserRole.CUSTOMER,
      });
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        adminAuthService.login({
          email: "customer@example.com",
          password: "wrong-password",
        }),
      assertUnauthorized,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.hash, DUMMY_PASSWORD_HASH);
  });

  it("calls bcrypt.compare with DUMMY_PASSWORD_HASH for OAuth admin login attempts", async () => {
    const { calls, compare } = createCompareStub();

    adminAuthRepository.findByEmailForLogin = async () =>
      createAdminUser({
        authProvider: AuthProvider.GOOGLE,
        password: null,
      });
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        adminAuthService.login({
          email: "oauth-admin@example.com",
          password: "wrong-password",
        }),
      assertUnauthorized,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.hash, DUMMY_PASSWORD_HASH);
  });

  it("calls bcrypt.compare with the real password hash for LOCAL admin with wrong password", async () => {
    const { calls, compare } = createCompareStub();

    adminAuthRepository.findByEmailForLogin = async () => createAdminUser();
    bcrypt.compare = compare as typeof bcrypt.compare;

    await assert.rejects(
      () =>
        adminAuthService.login({
          email: "admin@example.com",
          password: "wrong-password",
        }),
      assertUnauthorized,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.password, "wrong-password");
    assert.equal(calls[0]?.hash, REAL_PASSWORD_HASH);
  });

  it("keeps FORBIDDEN for inactive or deleted admins without bcrypt.compare", async () => {
    const inactiveCases = [
      createAdminUser({ isActive: false }),
      createAdminUser({ deletedAt: new Date("2026-08-01T00:00:00.000Z") }),
    ];

    for (const admin of inactiveCases) {
      const { calls, compare } = createCompareStub();

      adminAuthRepository.findByEmailForLogin = async () => admin;
      bcrypt.compare = compare as typeof bcrypt.compare;

      await assert.rejects(
        () =>
          adminAuthService.login({
            email: admin.email,
            password: "any-password",
          }),
        assertInactiveAdminForbidden,
      );

      assert.equal(calls.length, 0);
    }
  });
});
