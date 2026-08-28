import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LogAction, LogTargetType } from "@prisma/client";

import { reviewRepository } from "./review.repository";

describe("reviewRepository.findLatestHideReasonsByReviewIds", () => {
  it("HIDE만 조회하며 최신 HIDE memo만 reviewId에 매핑한다", async () => {
    let capturedWhere: unknown;

    const db = {
      activityLog: {
        findMany: async (args: { where: unknown; orderBy: unknown }) => {
          capturedWhere = args.where;
          return [
            { targetId: "11", memo: "두 번째 숨김 사유" },
            { targetId: "11", memo: "첫 번째 숨김 사유" },
          ];
        },
      },
    };

    const reasons = await reviewRepository.findLatestHideReasonsByReviewIds([11], db as never);

    assert.deepEqual(capturedWhere, {
      targetType: LogTargetType.REVIEW,
      action: LogAction.HIDE,
      targetId: { in: ["11"] },
    });
    assert.equal(reasons.get(11), "두 번째 숨김 사유");
    assert.equal(reasons.size, 1);
  });
});
