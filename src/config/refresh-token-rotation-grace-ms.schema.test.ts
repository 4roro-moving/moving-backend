import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REFRESH_TOKEN_ROTATION_GRACE_MS_DEFAULT,
  REFRESH_TOKEN_ROTATION_GRACE_MS_MAX,
  refreshTokenRotationGraceMsSchema,
} from "./refresh-token-rotation-grace-ms.schema";

describe("refreshTokenRotationGraceMsSchema", () => {
  it("defaults to 5000 when the environment variable is missing", () => {
    assert.equal(refreshTokenRotationGraceMsSchema.parse(undefined), 5000);
    assert.equal(
      refreshTokenRotationGraceMsSchema.parse(""),
      REFRESH_TOKEN_ROTATION_GRACE_MS_DEFAULT,
    );
    assert.equal(
      refreshTokenRotationGraceMsSchema.parse("   "),
      REFRESH_TOKEN_ROTATION_GRACE_MS_DEFAULT,
    );
  });

  it("allows 0 to disable the grace cache", () => {
    assert.equal(refreshTokenRotationGraceMsSchema.parse("0"), 0);
  });

  it("allows the maximum value of 10000", () => {
    assert.equal(
      refreshTokenRotationGraceMsSchema.parse("10000"),
      REFRESH_TOKEN_ROTATION_GRACE_MS_MAX,
    );
  });

  it("rejects negative values", () => {
    assert.equal(refreshTokenRotationGraceMsSchema.safeParse("-1").success, false);
  });

  it("rejects decimal values", () => {
    assert.equal(refreshTokenRotationGraceMsSchema.safeParse("1.5").success, false);
  });

  it("rejects non-number values", () => {
    assert.equal(refreshTokenRotationGraceMsSchema.safeParse("abc").success, false);
  });

  it("rejects values above the maximum", () => {
    assert.equal(refreshTokenRotationGraceMsSchema.safeParse("10001").success, false);
  });
});
