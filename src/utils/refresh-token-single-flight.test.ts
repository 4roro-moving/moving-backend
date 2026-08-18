import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RefreshTokenSessionType } from "@prisma/client";

import { runRefreshTokenSingleFlight } from "./refresh-token-single-flight";

type Deferred<T = void> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function waitForMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

describe("runRefreshTokenSingleFlight", () => {
  it("runs USER and ADMIN tasks separately for the same tokenHash", async () => {
    let userTaskCount = 0;
    let adminTaskCount = 0;

    const userGate = createDeferred<void>();
    const adminGate = createDeferred<void>();

    const userPromise = runRefreshTokenSingleFlight(
      RefreshTokenSessionType.USER,
      "shared-token-hash",
      async () => {
        userTaskCount += 1;
        await userGate.promise;
        return "user-result";
      },
    );

    const adminPromise = runRefreshTokenSingleFlight(
      RefreshTokenSessionType.ADMIN,
      "shared-token-hash",
      async () => {
        adminTaskCount += 1;
        await adminGate.promise;
        return "admin-result";
      },
    );

    await waitForMicrotasks();

    assert.equal(userTaskCount, 1);
    assert.equal(adminTaskCount, 1);

    userGate.resolve();
    adminGate.resolve();

    const [userResult, adminResult] = await Promise.all([userPromise, adminPromise]);

    assert.equal(userResult, "user-result");
    assert.equal(adminResult, "admin-result");
  });

  it("shares the same failure result for concurrent requests and runs the task once", async () => {
    let taskCount = 0;
    const gate = createDeferred<void>();
    const expectedError = new Error("single-flight task failed");

    const task = async () => {
      taskCount += 1;
      await gate.promise;
      throw expectedError;
    };

    const firstPromise = runRefreshTokenSingleFlight(
      RefreshTokenSessionType.USER,
      "failure-hash",
      task,
    );

    await waitForMicrotasks();

    const secondPromise = runRefreshTokenSingleFlight(
      RefreshTokenSessionType.USER,
      "failure-hash",
      task,
    );

    await waitForMicrotasks();

    assert.equal(taskCount, 1);

    gate.resolve();

    await assert.rejects(firstPromise, (error: unknown) => error === expectedError);
    await assert.rejects(secondPromise, (error: unknown) => error === expectedError);
  });

  it("runs a new task after a failed single-flight request completes", async () => {
    let taskCount = 0;
    const firstGate = createDeferred<void>();
    const firstError = new Error("first attempt failed");

    const failingTask = async () => {
      taskCount += 1;
      await firstGate.promise;
      throw firstError;
    };

    const firstAttempt = runRefreshTokenSingleFlight(
      RefreshTokenSessionType.USER,
      "retry-after-failure-hash",
      failingTask,
    );

    await waitForMicrotasks();
    firstGate.resolve();
    await assert.rejects(firstAttempt, (error: unknown) => error === firstError);

    const secondGate = createDeferred<void>();

    const retryTask = async () => {
      taskCount += 1;
      await secondGate.promise;
      return "retry-success";
    };

    const secondAttempt = runRefreshTokenSingleFlight(
      RefreshTokenSessionType.USER,
      "retry-after-failure-hash",
      retryTask,
    );

    await waitForMicrotasks();
    assert.equal(taskCount, 2);

    secondGate.resolve();

    assert.equal(await secondAttempt, "retry-success");
  });

  it("runs a new task after a successful single-flight request completes", async () => {
    let taskCount = 0;
    const firstGate = createDeferred<void>();

    const firstTask = async () => {
      taskCount += 1;
      await firstGate.promise;
      return "first-success";
    };

    const firstAttempt = runRefreshTokenSingleFlight(
      RefreshTokenSessionType.USER,
      "retry-after-success-hash",
      firstTask,
    );

    await waitForMicrotasks();
    firstGate.resolve();
    assert.equal(await firstAttempt, "first-success");

    const secondGate = createDeferred<void>();

    const secondTask = async () => {
      taskCount += 1;
      await secondGate.promise;
      return "second-success";
    };

    const secondAttempt = runRefreshTokenSingleFlight(
      RefreshTokenSessionType.USER,
      "retry-after-success-hash",
      secondTask,
    );

    await waitForMicrotasks();
    assert.equal(taskCount, 2);

    secondGate.resolve();

    assert.equal(await secondAttempt, "second-success");
  });
});
