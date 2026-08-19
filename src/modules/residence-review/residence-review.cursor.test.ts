import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError } from "../../lib/app-error";
import {
  decodeResidenceReviewCursor,
  encodeResidenceReviewCursor,
  encodeResidenceReviewNextCursor,
  sliceResidenceReviewCursorPage,
  toResidenceReviewCursorQuery,
} from "./residence-review.cursor";
import { buildCursorCondition } from "./residence-review.repository";
import { RESIDENCE_REVIEW_LIST_SORT } from "./residence-review.type";
import { listResidenceReviewQuerySchema } from "./residence-review.validator";

const createdAt = new Date("2026-08-20T00:00:00.000Z");

function isInvalidCursorError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === "VALIDATION_ERROR" &&
    error.message === "유효하지 않은 거주후기 목록 커서입니다."
  );
}

function parseCursorPayload(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("toResidenceReviewCursorQuery", () => {
  it("undefined 필터는 키를 생략한다", () => {
    const query = toResidenceReviewCursorQuery({
      sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT,
      keyword: undefined,
      regionId: undefined,
      rating: undefined,
    });

    assert.deepEqual(query, { sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT });
    assert.equal("keyword" in query, false);
    assert.equal("regionId" in query, false);
    assert.equal("rating" in query, false);
  });

  it("있는 필터만 포함한다", () => {
    const query = toResidenceReviewCursorQuery({
      sort: RESIDENCE_REVIEW_LIST_SORT.RATING,
      keyword: "역삼",
      regionId: 3,
      rating: 5,
    });

    assert.deepEqual(query, {
      sort: RESIDENCE_REVIEW_LIST_SORT.RATING,
      keyword: "역삼",
      regionId: 3,
      rating: 5,
    });
  });
});

describe("encode/decodeResidenceReviewCursor", () => {
  it("필터 없는 커서는 왕복 후 값이 같다", () => {
    const query = toResidenceReviewCursorQuery({ sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT });
    const encoded = encodeResidenceReviewCursor({
      ...query,
      ratingCursor: 4,
      createdAt,
      id: 12,
    });

    const payload = parseCursorPayload(encoded);
    assert.equal("keyword" in payload, false);
    assert.equal("regionId" in payload, false);
    assert.equal("rating" in payload, false);

    const decoded = decodeResidenceReviewCursor(encoded, query);

    assert.deepEqual(decoded, {
      sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT,
      ratingCursor: 4,
      createdAt,
      id: 12,
    });
    assert.equal(decoded && "keyword" in decoded, false);
  });

  it("필터가 있는 커서는 왕복 후 값이 같다", () => {
    const query = toResidenceReviewCursorQuery({
      sort: RESIDENCE_REVIEW_LIST_SORT.RATING,
      keyword: "역삼",
      regionId: 3,
      rating: 5,
    });
    const encoded = encodeResidenceReviewCursor({
      ...query,
      ratingCursor: 5,
      createdAt,
      id: 8,
    });

    assert.deepEqual(decodeResidenceReviewCursor(encoded, query), {
      sort: RESIDENCE_REVIEW_LIST_SORT.RATING,
      keyword: "역삼",
      regionId: 3,
      rating: 5,
      ratingCursor: 5,
      createdAt,
      id: 8,
    });
  });

  it("커서가 없으면 undefined를 반환한다", () => {
    const query = toResidenceReviewCursorQuery({ sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT });

    assert.equal(decodeResidenceReviewCursor(undefined, query), undefined);
  });

  it("sort가 다른 커서는 VALIDATION_ERROR이다", () => {
    const encoded = encodeResidenceReviewCursor({
      ...toResidenceReviewCursorQuery({ sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT }),
      ratingCursor: 5,
      createdAt,
      id: 1,
    });

    assert.throws(
      () =>
        decodeResidenceReviewCursor(
          encoded,
          toResidenceReviewCursorQuery({ sort: RESIDENCE_REVIEW_LIST_SORT.RATING }),
        ),
      isInvalidCursorError,
    );
  });

  it("keyword가 다른 커서는 VALIDATION_ERROR이다", () => {
    const encoded = encodeResidenceReviewCursor({
      ...toResidenceReviewCursorQuery({ sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT }),
      ratingCursor: 5,
      createdAt,
      id: 1,
    });

    assert.throws(
      () =>
        decodeResidenceReviewCursor(
          encoded,
          toResidenceReviewCursorQuery({
            sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT,
            keyword: "역삼",
          }),
        ),
      isInvalidCursorError,
    );
  });

  it("regionId가 다른 커서는 VALIDATION_ERROR이다", () => {
    const encoded = encodeResidenceReviewCursor({
      ...toResidenceReviewCursorQuery({
        sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT,
        regionId: 1,
      }),
      ratingCursor: 5,
      createdAt,
      id: 1,
    });

    assert.throws(
      () =>
        decodeResidenceReviewCursor(
          encoded,
          toResidenceReviewCursorQuery({
            sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT,
            regionId: 2,
          }),
        ),
      isInvalidCursorError,
    );
  });

  it("rating 필터가 다른 커서는 VALIDATION_ERROR이다", () => {
    const encoded = encodeResidenceReviewCursor({
      ...toResidenceReviewCursorQuery({
        sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT,
        rating: 5,
      }),
      ratingCursor: 5,
      createdAt,
      id: 1,
    });

    assert.throws(
      () =>
        decodeResidenceReviewCursor(
          encoded,
          toResidenceReviewCursorQuery({ sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT }),
        ),
      isInvalidCursorError,
    );
  });

  it("잘못된 커서는 VALIDATION_ERROR이다", () => {
    const query = toResidenceReviewCursorQuery({ sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT });

    assert.throws(() => decodeResidenceReviewCursor("not-a-cursor", query), isInvalidCursorError);
  });
});

describe("sliceResidenceReviewCursorPage / encodeResidenceReviewNextCursor", () => {
  const query = toResidenceReviewCursorQuery({ sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT });
  const reviews = Array.from({ length: 11 }, (_, index) => ({
    id: index + 1,
    rating: 5,
    createdAt: new Date(`2026-08-${String(20 - index).padStart(2, "0")}T00:00:00.000Z`),
  }));

  it("limit+1개가 오면 hasNext true이고 nextCursor는 페이지 마지막 행이다", () => {
    const { pageReviews, hasNext } = sliceResidenceReviewCursorPage(reviews, 10);

    assert.equal(hasNext, true);
    assert.equal(pageReviews.length, 10);
    assert.equal(pageReviews.at(-1)?.id, 10);
    assert.equal(reviews[10]?.id, 11);

    const nextCursor = encodeResidenceReviewNextCursor(pageReviews.at(-1), hasNext, query);
    const decoded = decodeResidenceReviewCursor(nextCursor ?? undefined, query);

    assert.equal(decoded?.id, 10);
    assert.notEqual(decoded?.id, 11);
  });

  it("limit개 이하면 hasNext false이고 nextCursor는 null이다", () => {
    const { pageReviews, hasNext } = sliceResidenceReviewCursorPage(reviews.slice(0, 10), 10);

    assert.equal(hasNext, false);
    assert.equal(pageReviews.length, 10);
    assert.equal(encodeResidenceReviewNextCursor(pageReviews.at(-1), hasNext, query), null);
  });

  it("빈 목록이면 nextCursor는 null이다", () => {
    const { pageReviews, hasNext } = sliceResidenceReviewCursorPage([], 10);

    assert.equal(hasNext, false);
    assert.equal(encodeResidenceReviewNextCursor(pageReviews.at(-1), hasNext, query), null);
  });
});

describe("buildCursorCondition", () => {
  it("createdAt 최신순은 createdAt desc, id desc tie-breaker와 맞다", () => {
    const cursor = {
      ...toResidenceReviewCursorQuery({ sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT }),
      ratingCursor: 4,
      createdAt,
      id: 10,
    };

    assert.deepEqual(buildCursorCondition(cursor), {
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: 10 } }],
    });
  });

  it("createdAtAsc는 createdAt asc, id asc tie-breaker와 맞다", () => {
    const cursor = {
      ...toResidenceReviewCursorQuery({ sort: RESIDENCE_REVIEW_LIST_SORT.CREATED_AT_ASC }),
      ratingCursor: 4,
      createdAt,
      id: 10,
    };

    assert.deepEqual(buildCursorCondition(cursor), {
      OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: 10 } }],
    });
  });

  it("rating 정렬은 별점, createdAt, id 3단 조건이다", () => {
    const cursor = {
      ...toResidenceReviewCursorQuery({ sort: RESIDENCE_REVIEW_LIST_SORT.RATING }),
      ratingCursor: 4,
      createdAt,
      id: 10,
    };

    assert.deepEqual(buildCursorCondition(cursor), {
      OR: [
        { rating: { lt: 4 } },
        { rating: 4, createdAt: { lt: createdAt } },
        { rating: 4, createdAt, id: { lt: 10 } },
      ],
    });
  });
});

describe("listResidenceReviewQuerySchema — cursor", () => {
  it("cursor가 문자열이 아니면 한국어 메시지를 반환한다", () => {
    const result = listResidenceReviewQuerySchema.safeParse({ cursor: 1 });

    assert.equal(result.success, false);
    if (result.success) {
      return;
    }

    assert.equal(
      result.error.issues.some((issue) => issue.message === "커서는 문자열이어야 합니다."),
      true,
    );
  });
});
