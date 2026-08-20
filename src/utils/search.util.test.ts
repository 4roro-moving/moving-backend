import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { escapeLikePattern } from "./search.util";

describe("escapeLikePattern", () => {
  it("%, _, \\ 를 PostgreSQL LIKE 리터럴 검색용으로 이스케이프한다", () => {
    assert.equal(escapeLikePattern(String.raw`100%_\value`), String.raw`100\%\_\\value`);
  });
});
