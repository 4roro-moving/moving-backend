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

  it("accepts up to 5 image keys", () => {
    const result = createReportSchema.safeParse({
      targetType: "MOVER",
      targetId: "6F9619FF-8B86-4D11-B42D-00CF4FC964FF",
      reason: "SPAM",
      imageKeys: [
        "reports/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg",
        "reports/11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png",
        "reports/11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp",
        "reports/11111111-1111-4111-8111-111111111111/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg",
        "reports/11111111-1111-4111-8111-111111111111/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png",
      ],
    });

    assert.equal(result.success, true);
  });

  it("fails when imageKeys exceed 5", () => {
    const result = createReportSchema.safeParse({
      targetType: "MOVER",
      targetId: "6F9619FF-8B86-4D11-B42D-00CF4FC964FF",
      reason: "SPAM",
      imageKeys: [
        "reports/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg",
        "reports/11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png",
        "reports/11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp",
        "reports/11111111-1111-4111-8111-111111111111/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg",
        "reports/11111111-1111-4111-8111-111111111111/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png",
        "reports/11111111-1111-4111-8111-111111111111/ffffffff-ffff-4fff-8fff-ffffffffffff.webp",
      ],
    });

    assert.equal(result.success, false);
  });

  it("fails when imageKeys contain duplicates", () => {
    const result = createReportSchema.safeParse({
      targetType: "MOVER",
      targetId: "6F9619FF-8B86-4D11-B42D-00CF4FC964FF",
      reason: "SPAM",
      imageKeys: [
        "reports/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg",
        "reports/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg",
      ],
    });

    assert.equal(result.success, false);
  });
});
