import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createReportSchema } from "./report.validator";

describe("createReportSchema", () => {
  it("OTHER인데 description이 없으면 실패", () => {
    const result = createReportSchema.safeParse({
      targetType: "REVIEW",
      targetId: "123",
      reason: "OTHER",
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
});
