import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDateMarker } from "../../../utils/kst";
import { memberListDateQuerySchema } from "./member-list.validator";

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
      assert.equal(memberListDateQuerySchema.safeParse(value).success, expected);
      assert.equal(parseDateMarker(value) !== null, expected);
    });
  }
});
