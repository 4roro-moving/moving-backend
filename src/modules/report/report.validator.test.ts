import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createReportSchema, MAX_REVIEW_TARGET_ID } from "./report.validator";

describe("createReportSchema", () => {
  it("OTHER인데 description이 없으면 실패", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "123",
      reason: "OTHER",
    });

    assert.equal(result.success, false);
  });

  it("OTHER인데 공백-only description이면 실패", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "123",
      reason: "OTHER",
      description: "   ",
    });

    assert.equal(result.success, false);
  });

  it("REVIEW 최대 Int는 성공", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: String(MAX_REVIEW_TARGET_ID),
      reason: "ABUSE",
    });

    assert.equal(result.success, true);
  });

  it("REVIEW Int 초과는 실패", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "2147483648",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("매우 긴 숫자 문자열은 실패", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "999999999999999999999999999999999",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("REVIEW targetId가 0이면 실패", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "0",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("REVIEW targetId가 음수면 실패", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "-1",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("REVIEW targetId가 소수면 실패", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "1.5",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("REVIEW targetId가 양의 정수 문자열이 아니면 실패", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "12a",
      reason: "ABUSE",
    });

    assert.equal(result.success, false);
  });

  it("MOVER targetId가 UUID 형식이 아니면 실패", () => {
    const result = createReportSchema.safeParse({
      targetType: "MOVER",
      targetId: "not-a-uuid",
      reason: "SPAM",
    });

    assert.equal(result.success, false);
  });

  it("MOVER UUID는 대소문자 혼합 입력도 성공", () => {
    const result = createReportSchema.safeParse({
      targetType: "MOVER",
      targetId: "6F9619FF-8B86-4D11-B42D-00CF4FC964FF",
      reason: "SPAM",
    });

    assert.equal(result.success, true);
  });
});
