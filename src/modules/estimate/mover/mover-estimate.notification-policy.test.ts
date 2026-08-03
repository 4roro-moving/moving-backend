import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getRejectionNotificationExpiresAt } from "./mover-estimate.notification-policy";

describe("반려 알림 만료 정책", () => {
  it("알림 생성 시점부터 7일 후에 만료합니다.", () => {
    const createdAt = new Date("2026-07-31T06:30:00.000Z");

    assert.equal(
      getRejectionNotificationExpiresAt(createdAt).toISOString(),
      "2026-08-07T06:30:00.000Z",
    );
  });
});
