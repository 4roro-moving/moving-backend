import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UserRole } from "@prisma/client";

import { loginSchema } from "./auth.validator";

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
