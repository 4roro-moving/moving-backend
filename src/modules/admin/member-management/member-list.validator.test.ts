import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDateMarker, parseDateMarker } from "../../../utils/kst";
import { memberListDateQuerySchema, memberListSortsSchema } from "./member-list.validator";

describe("memberListDateQuerySchema", () => {
  const cases = [
    ["2026-01-01", true],
    ["2024-02-29", true],
    ["2026-02-29", false],
    ["2026-02-30", false],
    ["2026-13-01", false],
    ["2026-1-1", false],
  ] as const;

  for (const [value, expected] of cases) {
    it(`${value}의 검증 결과가 DateMarker 변환 결과와 일치한다`, () => {
      const schemaResult = memberListDateQuerySchema.safeParse(value);
      const parsedDate = parseDateMarker(value);

      assert.equal(schemaResult.success, expected);
      assert.equal(parsedDate !== null, expected);

      if (schemaResult.success && parsedDate) {
        assert.equal(schemaResult.data, formatDateMarker(parsedDate));
      }
    });
  }
});

describe("memberListSortsSchema", () => {
  it("미처리 문의 건수 정렬을 허용한다", () => {
    const result = memberListSortsSchema.safeParse(["OPEN_INQUIRY_DESC", "CREATED_AT_ASC"]);

    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data, ["OPEN_INQUIRY_DESC", "CREATED_AT_ASC"]);
    }
  });

  it("같은 미처리 문의 정렬 기준의 중복을 거부한다", () => {
    const result = memberListSortsSchema.safeParse(["OPEN_INQUIRY_DESC", "OPEN_INQUIRY_ASC"]);

    assert.equal(result.success, false);
  });
});
