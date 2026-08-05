import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createReportSchema, MAX_REVIEW_TARGET_ID } from "./report.validator";

describe("createReportSchema", () => {
  it("fails when OTHER is selected without a description", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "123",
      reason: "OTHER",
    });

    assert.equal(result.success, false);
  });

  it("fails when OTHER has a whitespace-only description", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "123",
      reason: "OTHER",
      description: "   ",
    });

    assert.equal(result.success, false);
  });

  it("accepts the minimum REVIEW targetId boundary", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "1",
      reason: "ABUSE",
    });

    assert.equal(result.success, true);
  });

  it("accepts the maximum Prisma Int REVIEW targetId", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: String(MAX_REVIEW_TARGET_ID),
      reason: "ABUSE",
    });

    assert.equal(result.success, true);
  });

  it("fails when REVIEW targetId exceeds Prisma Int max", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "2147483648",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("fails when REVIEW targetId exceeds Number.MAX_SAFE_INTEGER", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "9007199254740993",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("fails when REVIEW targetId is an extremely large numeric string", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "999999999999999999999999999999999",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("fails when REVIEW targetId is zero", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "0",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("fails when REVIEW targetId is negative", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "-1",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("fails when REVIEW targetId is fractional", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "1.5",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("fails when REVIEW targetId is not a positive integer string", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "12a",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("fails when MOVER targetId is not a UUID", () => {
    const result = createReportSchema.safeParse({
      targetType: "MOVER",
      targetId: "not-a-uuid",
      reason: "SPAM",
    });

    assert.equal(result.success, false);
  });

  it("accepts mixed-case UUID input for a MOVER targetId", () => {
    const result = createReportSchema.safeParse({
      targetType: "MOVER",
      targetId: "6F9619FF-8B86-4D11-B42D-00CF4FC964FF",
      reason: "SPAM",
    });

    assert.equal(result.success, true);
  });
});
