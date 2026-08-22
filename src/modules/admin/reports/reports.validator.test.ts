import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ReportTargetType } from "@prisma/client";

import { listAdminReportsQuerySchema } from "./reports.validator";

describe("listAdminReportsQuerySchema", () => {
  it("keyword가 공백뿐이면 한국어 검증 메시지를 반환한다", () => {
    const result = listAdminReportsQuerySchema.safeParse({
      keyword: "   ",
    });

    assert.equal(result.success, false);

    if (result.success) {
      assert.fail("keyword 공백 입력은 실패해야 합니다.");
    }

    assert.equal(result.error.issues[0]?.message, "검색어를 1자 이상 입력해 주세요.");
  });

  it("keyword가 100자를 초과하면 한국어 검증 메시지를 반환한다", () => {
    const result = listAdminReportsQuerySchema.safeParse({
      keyword: "a".repeat(101),
    });

    assert.equal(result.success, false);

    if (result.success) {
      assert.fail("100자 초과 keyword는 실패해야 합니다.");
    }

    assert.equal(result.error.issues[0]?.message, "검색어는 100자 이하여야 합니다.");
  });

  it("CUSTOMER targetType 필터를 허용한다", () => {
    const result = listAdminReportsQuerySchema.safeParse({
      targetType: ReportTargetType.CUSTOMER,
    });

    assert.equal(result.success, true);
  });
});
