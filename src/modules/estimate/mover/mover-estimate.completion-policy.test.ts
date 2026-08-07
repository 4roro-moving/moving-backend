import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError } from "../../../lib/app-error";
import { assertCompletableEstimate } from "./mover-estimate.completion-policy";

const confirmedEstimate = {
  id: 10,
  status: "CONFIRMED" as const,
  estimateRequest: {
    status: "CONFIRMED" as const,
    confirmedEstimateId: 10,
    moveDate: new Date("2026-08-07T00:00:00.000Z"),
  },
};

const completionDay = new Date("2026-08-07T00:00:00.000Z");

describe("assertCompletableEstimate", () => {
  it("확정된 본인 견적은 완료 처리할 수 있습니다.", () => {
    assert.doesNotThrow(() => assertCompletableEstimate(confirmedEstimate, completionDay));
  });

  it("전송 대기 견적은 완료 처리할 수 없습니다.", () => {
    assert.throws(
      () => assertCompletableEstimate({ ...confirmedEstimate, status: "SENT" }, completionDay),
      (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    );
  });

  it("이미 완료된 요청은 다시 완료 처리할 수 없습니다.", () => {
    assert.throws(
      () =>
        assertCompletableEstimate(
          {
            ...confirmedEstimate,
            estimateRequest: { ...confirmedEstimate.estimateRequest, status: "COMPLETED" },
          },
          completionDay,
        ),
      (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    );
  });

  it("다른 견적이 확정된 요청은 완료 처리할 수 없습니다.", () => {
    assert.throws(
      () =>
        assertCompletableEstimate(
          {
            ...confirmedEstimate,
            estimateRequest: { ...confirmedEstimate.estimateRequest, confirmedEstimateId: 11 },
          },
          completionDay,
        ),
      (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    );
  });

  it("이용일 전에는 완료 처리할 수 없습니다.", () => {
    assert.throws(
      () => assertCompletableEstimate(confirmedEstimate, new Date("2026-08-06T14:59:59.999Z")),
      (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    );
  });

  it("한국 시간 기준 이용일이 시작되면 완료 처리할 수 있습니다.", () => {
    assert.doesNotThrow(() =>
      assertCompletableEstimate(confirmedEstimate, new Date("2026-08-06T15:00:00.000Z")),
    );
  });
});
