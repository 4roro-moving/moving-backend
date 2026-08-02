import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError } from "../../lib/app-error";
import { assertCancelable, CANCELABLE_STATUSES } from "./estimateRequest.service";

describe("CANCELABLE_STATUSES", () => {
  it("PENDING·OPEN만 취소 가능", () => {
    assert.deepEqual(CANCELABLE_STATUSES, ["PENDING", "OPEN"]);
  });
});

describe("assertCancelable", () => {
  it("OPEN + isActive 취소 가능", () => {
    assert.doesNotThrow(() => assertCancelable({ status: "OPEN", isActive: true }));
  });

  it("PENDING + isActive 취소 가능", () => {
    assert.doesNotThrow(() => assertCancelable({ status: "PENDING", isActive: true }));
  });

  it("이미 CANCELED면 ESTIMATE_REQUEST_ALREADY_CANCELED", () => {
    assert.throws(
      () => assertCancelable({ status: "CANCELED", isActive: false }),
      (error: unknown) =>
        error instanceof AppError && error.code === "ESTIMATE_REQUEST_ALREADY_CANCELED",
    );
  });

  it("CONFIRMED는 ESTIMATE_REQUEST_CANCEL_NOT_ALLOWED", () => {
    assert.throws(
      () => assertCancelable({ status: "CONFIRMED", isActive: true }),
      (error: unknown) =>
        error instanceof AppError && error.code === "ESTIMATE_REQUEST_CANCEL_NOT_ALLOWED",
    );
  });

  it("COMPLETED는 ESTIMATE_REQUEST_CANCEL_NOT_ALLOWED", () => {
    assert.throws(
      () => assertCancelable({ status: "COMPLETED", isActive: false }),
      (error: unknown) =>
        error instanceof AppError && error.code === "ESTIMATE_REQUEST_CANCEL_NOT_ALLOWED",
    );
  });

  it("EXPIRED는 ESTIMATE_REQUEST_CANCEL_NOT_ALLOWED", () => {
    assert.throws(
      () => assertCancelable({ status: "EXPIRED", isActive: false }),
      (error: unknown) =>
        error instanceof AppError && error.code === "ESTIMATE_REQUEST_CANCEL_NOT_ALLOWED",
    );
  });

  it("isActive=false(OPEN이어도)는 ESTIMATE_REQUEST_CANCEL_NOT_ALLOWED", () => {
    assert.throws(
      () => assertCancelable({ status: "OPEN", isActive: false }),
      (error: unknown) =>
        error instanceof AppError && error.code === "ESTIMATE_REQUEST_CANCEL_NOT_ALLOWED",
    );
  });
});
