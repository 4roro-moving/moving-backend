import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UserRole } from "@prisma/client";

import {
  googleOAuthSchema,
  kakaoOAuthSchema,
  loginSchema,
  naverOAuthSchema,
} from "./auth.validator";

const VALID_LOGIN_INPUT = {
  email: "user@example.com",
  password: "password1",
};

describe("loginSchema role validation", () => {
  it("accepts CUSTOMER and MOVER roles", () => {
    for (const role of [UserRole.CUSTOMER, UserRole.MOVER]) {
      const result = loginSchema.safeParse({
        ...VALID_LOGIN_INPUT,
        role,
      });

      assert.equal(result.success, true);
    }
  });

  it("rejects ADMIN role at validation time", () => {
    const result = loginSchema.safeParse({
      ...VALID_LOGIN_INPUT,
      role: UserRole.ADMIN,
    });

    assert.equal(result.success, false);
  });

  it("rejects missing role", () => {
    const result = loginSchema.safeParse(VALID_LOGIN_INPUT);

    assert.equal(result.success, false);
  });

  it("rejects invalid role values", () => {
    const result = loginSchema.safeParse({
      ...VALID_LOGIN_INPUT,
      role: "INVALID",
    });

    assert.equal(result.success, false);
  });
});

const VALID_OAUTH_CODE = "oauth-auth-code";

// 26.08.20 김나연 - [추가] intent 값 검증 테스트
describe("oauth intent validation", () => {
  it("accepts login and signup intents for Google, Kakao, and Naver", () => {
    for (const intent of ["login", "signup"] as const) {
      const googleResult = googleOAuthSchema.safeParse({
        code: VALID_OAUTH_CODE,
        role: UserRole.CUSTOMER,
        intent,
      });
      const kakaoResult = kakaoOAuthSchema.safeParse({
        code: VALID_OAUTH_CODE,
        role: UserRole.MOVER,
        intent,
      });
      const naverResult = naverOAuthSchema.safeParse({
        code: VALID_OAUTH_CODE,
        state: "oauth-state",
        role: UserRole.CUSTOMER,
        intent,
      });

      assert.equal(googleResult.success, true);
      assert.equal(kakaoResult.success, true);
      assert.equal(naverResult.success, true);
    }
  });

  it("rejects missing intent", () => {
    const googleResult = googleOAuthSchema.safeParse({
      code: VALID_OAUTH_CODE,
      role: UserRole.CUSTOMER,
    });
    const kakaoResult = kakaoOAuthSchema.safeParse({
      code: VALID_OAUTH_CODE,
      role: UserRole.CUSTOMER,
    });
    const naverResult = naverOAuthSchema.safeParse({
      code: VALID_OAUTH_CODE,
      state: "oauth-state",
      role: UserRole.CUSTOMER,
    });

    assert.equal(googleResult.success, false);
    assert.equal(kakaoResult.success, false);
    assert.equal(naverResult.success, false);
  });

  it("rejects invalid intent values", () => {
    const result = googleOAuthSchema.safeParse({
      code: VALID_OAUTH_CODE,
      role: UserRole.CUSTOMER,
      intent: "signin",
    });

    assert.equal(result.success, false);
  });
});
