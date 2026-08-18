import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { RefreshTokenSessionType } from "@prisma/client";

import {
  buildRefreshTokenFamilyReuseEpochKey,
  getRefreshTokenFamilyReuseEpoch,
  getRefreshTokenFamilyReuseEpochStoreSize,
  incrementRefreshTokenFamilyReuseEpoch,
  tryClearRefreshTokenFamilyReuseEpoch,
} from "./refresh-token-family-reuse-epoch";
import { runRefreshTokenFamilySerialization } from "./refresh-token-family-serialization";

const FAMILY_A = "11111111-1111-4111-8111-111111111111";
const FAMILY_B = "22222222-2222-4222-8222-222222222222";

describe("refresh token family reuse epoch", () => {
  afterEach(() => {
    tryClearRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A);
    tryClearRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_B);
    tryClearRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.ADMIN, FAMILY_A);
  });

  it("uses sessionType and familyId in the key without refresh token plaintext", () => {
    assert.equal(
      buildRefreshTokenFamilyReuseEpochKey(RefreshTokenSessionType.USER, FAMILY_A),
      `USER:${FAMILY_A}`,
    );
    assert.equal(
      buildRefreshTokenFamilyReuseEpochKey(RefreshTokenSessionType.ADMIN, FAMILY_A),
      `ADMIN:${FAMILY_A}`,
    );
    assert.doesNotMatch(
      buildRefreshTokenFamilyReuseEpochKey(RefreshTokenSessionType.USER, FAMILY_A),
      /refresh-token-plaintext/i,
    );
  });

  it("starts at epoch 0 and increments monotonically per family key", () => {
    assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A), 0);
    assert.equal(incrementRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A), 1);
    assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A), 1);
    assert.equal(incrementRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A), 2);

    assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_B), 0);
    assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.ADMIN, FAMILY_A), 0);
  });

  it("isolates USER and ADMIN epochs for the same familyId", () => {
    incrementRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A);
    incrementRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A);
    incrementRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.ADMIN, FAMILY_A);

    assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A), 2);
    assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.ADMIN, FAMILY_A), 1);

    tryClearRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A);
    tryClearRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.ADMIN, FAMILY_A);

    assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A), 0);
    assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.ADMIN, FAMILY_A), 0);
  });

  it("clears epoch entries when no family rotation is in flight", () => {
    incrementRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A);
    assert.ok(getRefreshTokenFamilyReuseEpochStoreSize() >= 1);

    tryClearRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A);

    assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A), 0);
    assert.equal(getRefreshTokenFamilyReuseEpochStoreSize(), 0);
  });

  it("does not clear epoch entries while family rotation is in flight", async () => {
    let rotationEntered = false;
    let releaseRotation!: () => void;

    const rotationStarted = new Promise<void>((resolve) => {
      releaseRotation = resolve;
    });

    const rotationPromise = runRefreshTokenFamilySerialization(
      RefreshTokenSessionType.USER,
      FAMILY_A,
      async () => {
        rotationEntered = true;
        incrementRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A);
        tryClearRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A);
        assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A), 1);
        await rotationStarted;
        return "done";
      },
    );

    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
    assert.equal(rotationEntered, true);

    releaseRotation();
    await rotationPromise;

    tryClearRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A);
    assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A), 0);
    assert.equal(getRefreshTokenFamilyReuseEpochStoreSize(), 0);
  });
});
