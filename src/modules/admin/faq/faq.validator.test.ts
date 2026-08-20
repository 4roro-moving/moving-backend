import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listFaqQuerySchema } from "./faq.validator";

describe("listFaqQuerySchema", () => {
  it("keyword가 100자를 초과하면 한국어 검증 메시지를 반환한다", () => {
    const result = listFaqQuerySchema.safeParse({
      keyword: "a".repeat(101),
    });

    assert.equal(result.success, false);

    if (result.success) {
      assert.fail("100자 초과 keyword는 실패해야 합니다.");
    }

    assert.equal(result.error.issues[0]?.message, "검색어는 100자 이하여야 합니다.");
  });
});
