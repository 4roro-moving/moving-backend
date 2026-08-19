import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { RefreshTokenSessionType } from "@prisma/client";

import {
  handleRefreshTokenFamilyReuseDetection,
  runRefreshTokenFamilyRotation,
} from "./refresh-token-family-coordination";
import {
  getRefreshTokenFamilyReuseEpoch,
  getRefreshTokenFamilyReuseEpochStoreSize,
  incrementRefreshTokenFamilyReuseEpoch,
  tryClearRefreshTokenFamilyReuseEpoch,
} from "./refresh-token-family-reuse-epoch";
import { runRefreshTokenFamilySerialization } from "./refresh-token-family-serialization";

const FAMILY_A = "11111111-1111-4111-8111-111111111111";
const FAMILY_B = "22222222-2222-4222-8222-222222222222";

type Deferred<T = void> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
};

function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("refresh token family coordination", () => {
  afterEach(() => {
    tryClearRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A);
    tryClearRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_B);
    tryClearRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.ADMIN, FAMILY_A);
  });

  it("increments reuse epoch before family revoke completes", async () => {
    const revokeGate = createDeferred<void>();

    const reusePromise = handleRefreshTokenFamilyReuseDetection(
      RefreshTokenSessionType.USER,
      FAMILY_A,
      async () => {
        assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A), 1);
        await revokeGate.promise;
        return { count: 0 };
      },
    );

    assert.equal(getRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A), 1);

    revokeGate.resolve();
    await reusePromise;

    assert.equal(getRefreshTokenFamilyReuseEpochStoreSize(), 0);
  });

  it("reconciles issued refresh token when reuse epoch is already elevated at rotation start", async () => {
    incrementRefreshTokenFamilyReuseEpoch(RefreshTokenSessionType.USER, FAMILY_A);

    let reconcileCalled = false;

    await runRefreshTokenFamilyRotation(
      RefreshTokenSessionType.USER,
      FAMILY_A,
      async () => ({ accessToken: "access", refreshToken: "issued-r3-token" }),
      async () => {
        reconcileCalled = true;
      },
    );

    assert.equal(reconcileCalled, true);
    assert.equal(getRefreshTokenFamilyReuseEpochStoreSize(), 0);
  });

  it("reconciles issued refresh token when reuse epoch increases during rotation", async () => {
    const rotateGate = createDeferred<void>();
    const reconciledHashes: string[] = [];

    const rotationPromise = runRefreshTokenFamilyRotation(
      RefreshTokenSessionType.USER,
      FAMILY_A,
      async () => {
        await rotateGate.promise;
        return { accessToken: "access", refreshToken: "issued-r3-token" };
      },
      async (issuedRefreshTokenHash) => {
        reconciledHashes.push(issuedRefreshTokenHash);
      },
    );

    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });

    await handleRefreshTokenFamilyReuseDetection(
      RefreshTokenSessionType.USER,
      FAMILY_A,
      async () => ({
        count: 0,
      }),
    );

    rotateGate.resolve();
    await rotationPromise;

    assert.equal(reconciledHashes.length, 1);
    assert.equal(getRefreshTokenFamilyReuseEpochStoreSize(), 0);
  });

  it("does not reconcile when reuse epoch is unchanged during rotation", async () => {
    let reconcileCalled = false;

    await runRefreshTokenFamilyRotation(
      RefreshTokenSessionType.USER,
      FAMILY_A,
      async () => ({ accessToken: "access", refreshToken: "issued-r3-token" }),
      async () => {
        reconcileCalled = true;
      },
    );

    assert.equal(reconcileCalled, false);
    assert.equal(getRefreshTokenFamilyReuseEpochStoreSize(), 0);
  });

  it("clears reuse epoch state after rotation failure", async () => {
    await assert.rejects(
      () =>
        runRefreshTokenFamilyRotation(
          RefreshTokenSessionType.USER,
          FAMILY_A,
          async () => {
            throw new Error("rotation failed");
          },
          async () => undefined,
        ),
      /rotation failed/,
    );

    assert.equal(getRefreshTokenFamilyReuseEpochStoreSize(), 0);
  });

  it("clears reuse epoch state after reuse detection failure", async () => {
    await assert.rejects(
      () =>
        handleRefreshTokenFamilyReuseDetection(RefreshTokenSessionType.USER, FAMILY_A, async () => {
          throw new Error("family revoke failed");
        }),
      /family revoke failed/,
    );

    assert.equal(getRefreshTokenFamilyReuseEpochStoreSize(), 0);
  });

  it("runs rotations for different families in parallel", async () => {
    const familyAGate = createDeferred<void>();
    const familyBGate = createDeferred<void>();
    let familyAStarted = false;
    let familyBStarted = false;

    const familyAPromise = runRefreshTokenFamilyRotation(
      RefreshTokenSessionType.USER,
      FAMILY_A,
      async () => {
        familyAStarted = true;
        await familyAGate.promise;
        return { accessToken: "a", refreshToken: "a-r3" };
      },
      async () => undefined,
    );

    const familyBPromise = runRefreshTokenFamilyRotation(
      RefreshTokenSessionType.USER,
      FAMILY_B,
      async () => {
        familyBStarted = true;
        await familyBGate.promise;
        return { accessToken: "b", refreshToken: "b-r3" };
      },
      async () => undefined,
    );

    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });

    assert.equal(familyAStarted, true);
    assert.equal(familyBStarted, true);

    familyAGate.resolve();
    familyBGate.resolve();

    await Promise.all([familyAPromise, familyBPromise]);
  });

  it("does not block ADMIN rotation when USER reuse epoch increases for the same familyId", async () => {
    const adminGate = createDeferred<void>();
    let adminRotationStarted = false;
    let reconcileCalled = false;

    const adminRotationPromise = runRefreshTokenFamilyRotation(
      RefreshTokenSessionType.ADMIN,
      FAMILY_A,
      async () => {
        adminRotationStarted = true;
        await adminGate.promise;
        return { accessToken: "admin-access", refreshToken: "admin-r3" };
      },
      async () => {
        reconcileCalled = true;
      },
    );

    await handleRefreshTokenFamilyReuseDetection(
      RefreshTokenSessionType.USER,
      FAMILY_A,
      async () => ({
        count: 0,
      }),
    );

    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
    assert.equal(adminRotationStarted, true);
    assert.equal(reconcileCalled, false);

    adminGate.resolve();
    await adminRotationPromise;

    assert.equal(reconcileCalled, false);
    assert.equal(getRefreshTokenFamilyReuseEpochStoreSize(), 0);
  });
});

describe("refresh token family serialization", () => {
  it("clears in-flight lock after task failure", async () => {
    await assert.rejects(
      () =>
        runRefreshTokenFamilySerialization(RefreshTokenSessionType.USER, FAMILY_A, async () => {
          throw new Error("serialization task failed");
        }),
      /serialization task failed/,
    );

    let secondTaskStarted = false;

    await runRefreshTokenFamilySerialization(RefreshTokenSessionType.USER, FAMILY_A, async () => {
      secondTaskStarted = true;
      return "ok";
    });

    assert.equal(secondTaskStarted, true);
  });
});
