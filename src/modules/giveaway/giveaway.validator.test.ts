import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GIVEAWAY_LIST_SORT, GIVEAWAY_REQUEST_STATUS } from "./giveaway.type";
import {
  listGiveawayQuerySchema,
  listGiveawayRequestQuerySchema,
  listMyGiveawayQuerySchema,
  listMyGiveawayRequestQuerySchema,
} from "./giveaway.validator";

describe("listGiveawayQuerySchema", () => {
  it("keyword가 없으면 sort 기본값은 LATEST이다", () => {
    const result = listGiveawayQuerySchema.parse({});

    assert.equal(result.keyword, undefined);
    assert.equal(result.sort, GIVEAWAY_LIST_SORT.LATEST);
  });

  it("keyword가 공백뿐이면 한국어 검증 메시지를 반환한다", () => {
    const result = listGiveawayQuerySchema.safeParse({
      keyword: "   ",
    });

    assert.equal(result.success, false);

    if (result.success) {
      assert.fail("keyword 공백 입력은 실패해야 합니다.");
    }

    assert.equal(result.error.issues[0]?.message, "검색어를 입력해 주세요.");
  });

  it("keyword가 100자를 초과하면 한국어 검증 메시지를 반환한다", () => {
    const result = listGiveawayQuerySchema.safeParse({
      keyword: "a".repeat(101),
    });

    assert.equal(result.success, false);

    if (result.success) {
      assert.fail("100자 초과 keyword는 실패해야 합니다.");
    }

    assert.equal(result.error.issues[0]?.message, "검색어는 100자 이하여야 합니다.");
  });

  it("올바르지 않은 sort는 한국어 검증 메시지를 반환한다", () => {
    const result = listGiveawayQuerySchema.safeParse({
      sort: "NEWEST",
    });

    assert.equal(result.success, false);

    if (result.success) {
      assert.fail("올바르지 않은 sort는 실패해야 합니다.");
    }

    assert.equal(result.error.issues[0]?.message, "올바른 정렬 기준이 아닙니다.");
  });
});

describe("listMyGiveawayRequestQuerySchema", () => {
  it("제목 검색, 신청 상태, 오래된 순을 함께 받는다", () => {
    const result = listMyGiveawayRequestQuerySchema.parse({
      keyword: "책상",
      status: GIVEAWAY_REQUEST_STATUS.PENDING,
      sort: GIVEAWAY_LIST_SORT.OLDEST,
    });

    assert.deepEqual(result, {
      limit: 10,
      keyword: "책상",
      status: GIVEAWAY_REQUEST_STATUS.PENDING,
      sort: GIVEAWAY_LIST_SORT.OLDEST,
    });
  });
});

describe("listMyGiveawayQuerySchema", () => {
  it("처리 상태와 오래된 순을 받는다", () => {
    const result = listMyGiveawayQuerySchema.parse({
      status: "IN_PROGRESS",
      sort: GIVEAWAY_LIST_SORT.OLDEST,
    });

    assert.deepEqual(result, {
      limit: 10,
      status: "IN_PROGRESS",
      sort: GIVEAWAY_LIST_SORT.OLDEST,
    });
    assert.equal("keyword" in result, false);
  });

  it("올바르지 않은 처리 상태는 한국어 검증 메시지를 반환한다", () => {
    const result = listMyGiveawayQuerySchema.safeParse({
      status: "PENDING",
    });

    assert.equal(result.success, false);

    if (result.success) {
      assert.fail("올바르지 않은 처리 상태는 실패해야 합니다.");
    }

    assert.equal(result.error.issues[0]?.message, "올바른 나눔 상태가 아닙니다.");
  });
});

describe("listGiveawayRequestQuerySchema", () => {
  it("작성자 신청 목록에는 제목 검색이 없다", () => {
    const result = listGiveawayRequestQuerySchema.parse({
      status: GIVEAWAY_REQUEST_STATUS.SELECTED,
    });

    assert.equal("keyword" in result, false);
    assert.equal(result.sort, GIVEAWAY_LIST_SORT.LATEST);
  });
});
