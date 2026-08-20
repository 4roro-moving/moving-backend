import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { RefreshTokenSessionType } from "@prisma/client";

import "dotenv/config";

import {
  buildRefreshTokenRotationGraceCacheKey,
  clearRefreshTokenRotationGraceCache,
  getRefreshTokenRotationGraceCacheSize,
  getRefreshTokenRotationGraceResult,
  getRefreshTokenRotationGraceTtlMs,
  setRefreshTokenRotationGraceResult,
} from "./refresh-token-rotation-grace-cache";

const TOKEN_HASH_R1 = "abc123tokenhash";
const TOKEN_HASH_R2 = "def456tokenhash";

describe("refresh token rotation grace cache", () => {
  const originalGraceTtl = process.env.REFRESH_TOKEN_ROTATION_GRACE_MS;

  afterEach(() => {
    clearRefreshTokenRotationGraceCache();

    if (originalGraceTtl === undefined) {
      delete process.env.REFRESH_TOKEN_ROTATION_GRACE_MS;
    } else {
      process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = originalGraceTtl;
    }
  });

  it("uses sessionType and tokenHash in the key without refresh token plaintext", () => {
    assert.equal(
      buildRefreshTokenRotationGraceCacheKey(RefreshTokenSessionType.USER, TOKEN_HASH_R1),
      `USER:${TOKEN_HASH_R1}`,
    );
    assert.equal(
      buildRefreshTokenRotationGraceCacheKey(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1),
      `ADMIN:${TOKEN_HASH_R1}`,
    );
    assert.doesNotMatch(
      buildRefreshTokenRotationGraceCacheKey(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1),
      /eyJ/i,
    );
  });

  it("returns cached success results within the configured TTL", () => {
    process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = "1000";

    const result = { accessToken: "access-1", refreshToken: "refresh-2" };

    setRefreshTokenRotationGraceResult(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1, result);

    assert.deepEqual(
      getRefreshTokenRotationGraceResult(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1),
      result,
    );
    assert.equal(getRefreshTokenRotationGraceCacheSize(), 1);
  });

  it("isolates USER and ADMIN cache entries for the same token hash", () => {
    process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = "1000";

    setRefreshTokenRotationGraceResult(RefreshTokenSessionType.USER, TOKEN_HASH_R1, {
      accessToken: "user-access",
      refreshToken: "user-refresh",
    });
    setRefreshTokenRotationGraceResult(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1, {
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
    });

    assert.deepEqual(
      getRefreshTokenRotationGraceResult(RefreshTokenSessionType.USER, TOKEN_HASH_R1),
      { accessToken: "user-access", refreshToken: "user-refresh" },
    );
    assert.deepEqual(
      getRefreshTokenRotationGraceResult(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1),
      { accessToken: "admin-access", refreshToken: "admin-refresh" },
    );
  });

  it("does not cache failures and only stores explicitly set success results", () => {
    process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = "1000";

    assert.equal(
      getRefreshTokenRotationGraceResult(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1),
      null,
    );
    assert.equal(getRefreshTokenRotationGraceCacheSize(), 0);
  });

  it("returns null and removes expired entries after TTL", async () => {
    process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = "20";

    setRefreshTokenRotationGraceResult(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1, {
      accessToken: "access-1",
      refreshToken: "refresh-2",
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });

    assert.equal(
      getRefreshTokenRotationGraceResult(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1),
      null,
    );
    assert.equal(getRefreshTokenRotationGraceCacheSize(), 0);
  });

  it("disables caching when TTL is configured to zero", () => {
    process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = "0";
    assert.equal(getRefreshTokenRotationGraceTtlMs(), 0);

    setRefreshTokenRotationGraceResult(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1, {
      accessToken: "access-1",
      refreshToken: "refresh-2",
    });

    assert.equal(
      getRefreshTokenRotationGraceResult(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1),
      null,
    );
    assert.equal(getRefreshTokenRotationGraceCacheSize(), 0);
  });

  it("does not return cached results for a different token hash", () => {
    process.env.REFRESH_TOKEN_ROTATION_GRACE_MS = "1000";

    setRefreshTokenRotationGraceResult(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R1, {
      accessToken: "access-1",
      refreshToken: "refresh-2",
    });

    assert.equal(
      getRefreshTokenRotationGraceResult(RefreshTokenSessionType.ADMIN, TOKEN_HASH_R2),
      null,
    );
  });
});
