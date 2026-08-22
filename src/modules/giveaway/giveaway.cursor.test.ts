import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError } from "../../lib/app-error";
import {
  decodeGiveawayCursor,
  decodeGiveawayRequestCursor,
  encodeGiveawayCursor,
  encodeGiveawayNextCursor,
  encodeGiveawayRequestCursor,
  sliceGiveawayCursorPage,
  toGiveawayCursorQuery,
  toGiveawayRequestCursorQuery,
} from "./giveaway.cursor";
import { buildCursorCondition } from "./giveaway.repository";
import {
  GIVEAWAY_LIST_SORT,
  GIVEAWAY_PAGINATION,
  GIVEAWAY_REQUEST_STATUS,
  GIVEAWAY_STATUS,
  GIVEAWAY_TEXT_LENGTH,
} from "./giveaway.type";
import { listGiveawayQuerySchema } from "./giveaway.validator";

const createdAt = new Date("2026-08-20T00:00:00.000Z");

function isInvalidGiveawayCursorError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === "VALIDATION_ERROR" &&
    error.message === "유효하지 않은 나눔 목록 커서입니다."
  );
}

function isInvalidGiveawayRequestCursorError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === "VALIDATION_ERROR" &&
    error.message === "유효하지 않은 나눔 신청 목록 커서입니다."
  );
}

function parseCursorPayload(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("toGiveawayCursorQuery", () => {
  it("undefined 필터는 키를 생략한다", () => {
    const query = toGiveawayCursorQuery({
      sort: GIVEAWAY_LIST_SORT.LATEST,
      status: undefined,
      regionId: undefined,
      keyword: undefined,
    });

    assert.deepEqual(query, { sort: GIVEAWAY_LIST_SORT.LATEST });
    assert.equal("status" in query, false);
    assert.equal("regionId" in query, false);
    assert.equal("keyword" in query, false);
  });

  it("있는 필터만 포함한다", () => {
    const query = toGiveawayCursorQuery({
      sort: GIVEAWAY_LIST_SORT.OLDEST,
      status: GIVEAWAY_STATUS.AVAILABLE,
      regionId: 3,
      keyword: "책상",
    });

    assert.deepEqual(query, {
      sort: GIVEAWAY_LIST_SORT.OLDEST,
      status: GIVEAWAY_STATUS.AVAILABLE,
      regionId: 3,
      keyword: "책상",
    });
  });
});

describe("encode/decodeGiveawayCursor", () => {
  it("필터 없는 커서는 왕복 후 값이 같다", () => {
    const query = toGiveawayCursorQuery({ sort: GIVEAWAY_LIST_SORT.LATEST });
    const encoded = encodeGiveawayCursor({
      ...query,
      createdAt,
      id: 12,
    });

    const payload = parseCursorPayload(encoded);
    assert.equal("status" in payload, false);
    assert.equal("regionId" in payload, false);
    assert.equal("keyword" in payload, false);

    const decoded = decodeGiveawayCursor(encoded, query);

    assert.deepEqual(decoded, {
      sort: GIVEAWAY_LIST_SORT.LATEST,
      createdAt,
      id: 12,
    });
    assert.equal(decoded && "keyword" in decoded, false);
  });

  it("필터가 있는 커서는 왕복 후 값이 같다", () => {
    const query = toGiveawayCursorQuery({
      sort: GIVEAWAY_LIST_SORT.OLDEST,
      status: GIVEAWAY_STATUS.AVAILABLE,
      regionId: 3,
      keyword: "책상",
    });
    const encoded = encodeGiveawayCursor({
      ...query,
      createdAt,
      id: 8,
    });

    assert.deepEqual(decodeGiveawayCursor(encoded, query), {
      sort: GIVEAWAY_LIST_SORT.OLDEST,
      status: GIVEAWAY_STATUS.AVAILABLE,
      regionId: 3,
      keyword: "책상",
      createdAt,
      id: 8,
    });
  });

  it("커서가 없으면 undefined를 반환한다", () => {
    const query = toGiveawayCursorQuery({ sort: GIVEAWAY_LIST_SORT.LATEST });

    assert.equal(decodeGiveawayCursor(undefined, query), undefined);
  });

  it("sort가 다른 커서는 VALIDATION_ERROR이다", () => {
    const encoded = encodeGiveawayCursor({
      ...toGiveawayCursorQuery({ sort: GIVEAWAY_LIST_SORT.LATEST }),
      createdAt,
      id: 1,
    });

    assert.throws(
      () =>
        decodeGiveawayCursor(encoded, toGiveawayCursorQuery({ sort: GIVEAWAY_LIST_SORT.OLDEST })),
      isInvalidGiveawayCursorError,
    );
  });

  it("keyword가 다른 커서는 VALIDATION_ERROR이다", () => {
    const encoded = encodeGiveawayCursor({
      ...toGiveawayCursorQuery({ sort: GIVEAWAY_LIST_SORT.LATEST }),
      createdAt,
      id: 1,
    });

    assert.throws(
      () =>
        decodeGiveawayCursor(
          encoded,
          toGiveawayCursorQuery({
            sort: GIVEAWAY_LIST_SORT.LATEST,
            keyword: "책상",
          }),
        ),
      isInvalidGiveawayCursorError,
    );
  });

  it("최대 한글 keyword를 포함한 커서는 MAX_CURSOR_LENGTH 이하다", () => {
    const query = toGiveawayCursorQuery({
      sort: GIVEAWAY_LIST_SORT.OLDEST,
      status: GIVEAWAY_STATUS.IN_PROGRESS,
      regionId: 99_999,
      keyword: "가".repeat(GIVEAWAY_TEXT_LENGTH.KEYWORD_MAX),
    });
    const encoded = encodeGiveawayCursor({
      ...query,
      createdAt,
      id: 2_147_483_647,
    });

    assert.ok(encoded.length <= GIVEAWAY_PAGINATION.MAX_CURSOR_LENGTH);
    assert.equal(listGiveawayQuerySchema.parse({ cursor: encoded }).cursor, encoded);
  });

  it("잘못된 커서는 VALIDATION_ERROR이다", () => {
    const query = toGiveawayCursorQuery({ sort: GIVEAWAY_LIST_SORT.LATEST });

    assert.throws(() => decodeGiveawayCursor("not-a-cursor", query), isInvalidGiveawayCursorError);
  });
});

describe("encode/decodeGiveawayRequestCursor", () => {
  it("신청 목록 커서는 왕복 후 값이 같다", () => {
    const query = toGiveawayRequestCursorQuery({
      sort: GIVEAWAY_LIST_SORT.LATEST,
      status: GIVEAWAY_REQUEST_STATUS.PENDING,
      keyword: "책상",
    });
    const encoded = encodeGiveawayRequestCursor({
      ...query,
      createdAt,
      id: 4,
    });

    assert.deepEqual(decodeGiveawayRequestCursor(encoded, query), {
      sort: GIVEAWAY_LIST_SORT.LATEST,
      status: GIVEAWAY_REQUEST_STATUS.PENDING,
      keyword: "책상",
      createdAt,
      id: 4,
    });
  });

  it("status가 다른 커서는 VALIDATION_ERROR이다", () => {
    const encoded = encodeGiveawayRequestCursor({
      ...toGiveawayRequestCursorQuery({
        sort: GIVEAWAY_LIST_SORT.LATEST,
        status: GIVEAWAY_REQUEST_STATUS.PENDING,
      }),
      createdAt,
      id: 1,
    });

    assert.throws(
      () =>
        decodeGiveawayRequestCursor(
          encoded,
          toGiveawayRequestCursorQuery({
            sort: GIVEAWAY_LIST_SORT.LATEST,
            status: GIVEAWAY_REQUEST_STATUS.SELECTED,
          }),
        ),
      isInvalidGiveawayRequestCursorError,
    );
  });
});

describe("sliceGiveawayCursorPage / encodeGiveawayNextCursor", () => {
  const query = toGiveawayCursorQuery({ sort: GIVEAWAY_LIST_SORT.LATEST });
  const items = Array.from({ length: 11 }, (_, index) => ({
    id: index + 1,
    createdAt: new Date(`2026-08-${String(20 - index).padStart(2, "0")}T00:00:00.000Z`),
  }));

  it("limit+1개가 오면 hasNext true이고 nextCursor는 페이지 마지막 행이다", () => {
    const { pageItems, hasNext } = sliceGiveawayCursorPage(items, 10);

    assert.equal(hasNext, true);
    assert.equal(pageItems.length, 10);
    assert.equal(pageItems.at(-1)?.id, 10);
    assert.equal(items[10]?.id, 11);

    const nextCursor = encodeGiveawayNextCursor(pageItems.at(-1), hasNext, query);
    const decoded = decodeGiveawayCursor(nextCursor ?? undefined, query);

    assert.equal(decoded?.id, 10);
    assert.notEqual(decoded?.id, 11);
  });

  it("limit개 이하면 hasNext false이고 nextCursor는 null이다", () => {
    const { pageItems, hasNext } = sliceGiveawayCursorPage(items.slice(0, 10), 10);

    assert.equal(hasNext, false);
    assert.equal(pageItems.length, 10);
    assert.equal(encodeGiveawayNextCursor(pageItems.at(-1), hasNext, query), null);
  });

  it("빈 목록이면 nextCursor는 null이다", () => {
    const { pageItems, hasNext } = sliceGiveawayCursorPage([], 10);

    assert.equal(hasNext, false);
    assert.equal(encodeGiveawayNextCursor(pageItems.at(-1), hasNext, query), null);
  });
});

describe("buildCursorCondition", () => {
  it("LATEST는 createdAt desc, id desc tie-breaker와 맞다", () => {
    const cursor = {
      ...toGiveawayCursorQuery({ sort: GIVEAWAY_LIST_SORT.LATEST }),
      createdAt,
      id: 10,
    };

    assert.deepEqual(buildCursorCondition(cursor), {
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: 10 } }],
    });
  });

  it("OLDEST는 createdAt asc, id asc tie-breaker와 맞다", () => {
    const cursor = {
      ...toGiveawayCursorQuery({ sort: GIVEAWAY_LIST_SORT.OLDEST }),
      createdAt,
      id: 10,
    };

    assert.deepEqual(buildCursorCondition(cursor), {
      OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: 10 } }],
    });
  });
});

describe("listGiveawayQuerySchema — cursor", () => {
  it("cursor가 문자열이 아니면 한국어 메시지를 반환한다", () => {
    const result = listGiveawayQuerySchema.safeParse({ cursor: 1 });

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
