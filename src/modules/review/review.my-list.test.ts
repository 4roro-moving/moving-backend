import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import type { MyReviewRow } from "./review.repository";

const NOW = new Date("2026-08-20T00:00:00.000Z");

function createMyReviewRow(overrides: Partial<MyReviewRow> = {}): MyReviewRow {
  return {
    id: 1,
    estimateId: 10,
    rating: 5,
    content: "좋은 이사였습니다.",
    createdAt: NOW,
    isHidden: false,
    estimate: {
      price: 300000,
      estimateRequest: {
        id: 100,
        moveType: "HOME",
        moveDate: NOW,
        fromAddress: "서울시 강남구",
        toAddress: "서울시 서초구",
      },
    },
    mover: {
      id: "mover-1",
      name: "기사",
      moverProfile: {
        nickname: "친절한기사",
        imageUrl: null,
        shortIntro: "소개",
      },
    },
    ...overrides,
  };
}

const findMyReviewsByCustomerId = mock.fn(async () => [] as MyReviewRow[]);
const countMyReviewsByCustomerId = mock.fn(async () => 0);
const findLatestHideReasonsByReviewIds = mock.fn(
  async (_reviewIds: number[]) => new Map<number, string | null>(),
);

mock.module("./review.repository", {
  namedExports: {
    reviewRepository: {
      findMyReviewsByCustomerId,
      countMyReviewsByCustomerId,
      findLatestHideReasonsByReviewIds,
      findMoverForReviewList: async () => null,
      findReviewsByMoverId: async () => [],
      countReviewsByMoverId: async () => 0,
      findReviewableEstimatesByCustomerId: async () => [],
      findEstimateForReviewById: async () => null,
      createReview: async () => ({
        id: 1,
        estimateId: 1,
        rating: 5,
        content: "",
        createdAt: NOW,
      }),
      aggregateMoverReviewStats: async () => ({ _avg: { rating: null }, _count: { _all: 0 } }),
      updateMoverReviewStats: async () => ({}),
    },
  },
});

mock.module("../notification/notification.service", {
  namedExports: {
    notificationService: {
      createNotification: async () => ({}),
      sendNotification: () => {},
    },
  },
});

const { reviewService } = await import("./review.service");
const { mapMyReview } = await import("./review.mapper");

afterEach(() => {
  findMyReviewsByCustomerId.mock.resetCalls();
  countMyReviewsByCustomerId.mock.resetCalls();
  findLatestHideReasonsByReviewIds.mock.resetCalls();
});

describe("mapMyReview hiddenReason", () => {
  it("숨김 리뷰는 isHidden true와 hiddenReason을 반환한다", () => {
    const mapped = mapMyReview(createMyReviewRow({ isHidden: true }), "부적절한 표현");

    assert.equal(mapped.isHidden, true);
    assert.equal(mapped.hiddenReason, "부적절한 표현");
  });

  it("공개 리뷰는 isHidden false이고 hiddenReason은 null이다", () => {
    const mapped = mapMyReview(createMyReviewRow({ isHidden: false }), "무시되어야 함");

    assert.equal(mapped.isHidden, false);
    assert.equal(mapped.hiddenReason, null);
  });
});

describe("reviewService.getMyReviewList", () => {
  it("숨김 리뷰는 최신 HIDE ActivityLog memo를 hiddenReason으로 반환한다", async () => {
    findMyReviewsByCustomerId.mock.mockImplementation(async () => [
      createMyReviewRow({ id: 7, isHidden: true }),
    ]);
    countMyReviewsByCustomerId.mock.mockImplementation(async () => 1);
    findLatestHideReasonsByReviewIds.mock.mockImplementation(async () => {
      return new Map([[7, "최신 숨김 사유"]]);
    });

    const result = await reviewService.getMyReviewList({
      customerId: "customer-1",
      page: 1,
      limit: 10,
    });

    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0]?.isHidden, true);
    assert.equal(result.reviews[0]?.hiddenReason, "최신 숨김 사유");
    assert.deepEqual(findLatestHideReasonsByReviewIds.mock.calls[0]?.arguments[0], [7]);
  });

  it("공개 리뷰는 hiddenReason이 null이고 HIDE 사유 조회를 하지 않는다", async () => {
    findMyReviewsByCustomerId.mock.mockImplementation(async () => [
      createMyReviewRow({ id: 3, isHidden: false }),
    ]);
    countMyReviewsByCustomerId.mock.mockImplementation(async () => 1);

    const result = await reviewService.getMyReviewList({
      customerId: "customer-1",
      page: 1,
      limit: 10,
    });

    assert.equal(result.reviews[0]?.isHidden, false);
    assert.equal(result.reviews[0]?.hiddenReason, null);
    assert.deepEqual(findLatestHideReasonsByReviewIds.mock.calls[0]?.arguments[0], []);
  });

  it("HIDE → UNHIDE → HIDE 이력이 있어도 repository가 준 최신 HIDE 사유만 반환한다", async () => {
    findMyReviewsByCustomerId.mock.mockImplementation(async () => [
      createMyReviewRow({ id: 11, isHidden: true }),
    ]);
    countMyReviewsByCustomerId.mock.mockImplementation(async () => 1);
    findLatestHideReasonsByReviewIds.mock.mockImplementation(async () => {
      return new Map([[11, "두 번째 숨김 사유"]]);
    });

    const result = await reviewService.getMyReviewList({
      customerId: "customer-1",
      page: 1,
      limit: 10,
    });

    assert.equal(result.reviews[0]?.hiddenReason, "두 번째 숨김 사유");
  });
});
