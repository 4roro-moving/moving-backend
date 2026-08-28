import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createReportSchema, MAX_REPORT_NUMERIC_TARGET_ID } from "./report.validator";

const VALID_USER_ID = "6F9619FF-8B86-4D11-B42D-00CF4FC964FF";

describe("createReportSchema", () => {
  it("OTHER 선택 시 description이 없으면 실패한다", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "123",
      reason: "OTHER",
    });

    assert.equal(result.success, false);
  });

  it("CUSTOMER UUID를 허용한다", () => {
    const result = createReportSchema.safeParse({
      targetType: "CUSTOMER",
      targetId: VALID_USER_ID,
      reason: "ABUSE",
    });

    assert.equal(result.success, true);
  });

  it("MOVER UUID를 허용한다", () => {
    const result = createReportSchema.safeParse({
      targetType: "MOVER",
      targetId: VALID_USER_ID,
      reason: "SPAM",
    });

    assert.equal(result.success, true);
  });

  it("CUSTOMER와 MOVER의 잘못된 UUID를 거부한다", () => {
    for (const targetType of ["CUSTOMER", "MOVER"] as const) {
      const result = createReportSchema.safeParse({
        targetType,
        targetId: "not-a-uuid",
        reason: "SPAM",
      });

      assert.equal(result.success, false);
    }
  });

  it("REVIEW, RESIDENCE_REVIEW, GIVEAWAY 양의 정수 ID를 허용한다", () => {
    for (const targetType of ["REVIEW", "RESIDENCE_REVIEW", "GIVEAWAY"] as const) {
      const result = createReportSchema.safeParse({
        targetType,
        targetId: "123",
        reason: "ABUSE",
      });

      assert.equal(result.success, true);
    }
  });

  it("numeric targetId 최대 Prisma Int 값을 허용한다", () => {
    for (const targetType of ["REVIEW", "RESIDENCE_REVIEW", "GIVEAWAY"] as const) {
      const result = createReportSchema.safeParse({
        targetType,
        targetId: String(MAX_REPORT_NUMERIC_TARGET_ID),
        reason: "ABUSE",
      });

      assert.equal(result.success, true);
    }
  });

  it("numeric targetId가 0, 음수, 소수, Prisma Int 초과이면 실패한다", () => {
    const invalidIds = ["0", "-1", "1.5", "2147483648"];

    for (const targetType of ["REVIEW", "RESIDENCE_REVIEW", "GIVEAWAY"] as const) {
      for (const targetId of invalidIds) {
        const result = createReportSchema.safeParse({
          targetType,
          targetId,
          reason: "ABUSE",
        });

        assert.equal(result.success, false);
      }
    }
  });
});
