import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { authRepository } from "./auth.repository";
import { authService } from "./auth.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

describe("authService.cleanupExpiredRefreshTokens", () => {
  const originalDeleteRefreshTokensExpiredBefore = authRepository.deleteRefreshTokensExpiredBefore;
  const originalDateNow = Date.now;

  afterEach(() => {
    authRepository.deleteRefreshTokensExpiredBefore = originalDeleteRefreshTokensExpiredBefore;
    Date.now = originalDateNow;
  });

  it("passes a cutoff exactly 30 days before the current time to the repository", async () => {
    const fixedNow = new Date("2026-08-13T04:00:00.000Z").getTime();
    Date.now = () => fixedNow;

    let receivedCutoff: Date | undefined;

    authRepository.deleteRefreshTokensExpiredBefore = async (cutoff) => {
      receivedCutoff = cutoff;
      return { count: 0 };
    };

    await authService.cleanupExpiredRefreshTokens();

    const expectedCutoff = new Date(fixedNow - RETENTION_DAYS * DAY_MS);
    assert.equal(receivedCutoff?.getTime(), expectedCutoff.getTime());
  });

  it("returns the deleteMany count from the repository", async () => {
    authRepository.deleteRefreshTokensExpiredBefore = async () => ({ count: 12 });

    const deletedCount = await authService.cleanupExpiredRefreshTokens();

    assert.equal(deletedCount, 12);
  });

  it("does not swallow repository errors", async () => {
    const repositoryError = new Error("refresh token cleanup failed");

    authRepository.deleteRefreshTokensExpiredBefore = async () => {
      throw repositoryError;
    };

    await assert.rejects(
      () => authService.cleanupExpiredRefreshTokens(),
      (error: unknown) => error === repositoryError,
    );
  });
});
