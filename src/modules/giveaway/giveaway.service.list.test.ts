import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { encodeGiveawayCursor, toGiveawayCursorQuery } from "./giveaway.cursor";
import { giveawayRepository } from "./giveaway.repository";
import { giveawayService } from "./giveaway.service";
import { GIVEAWAY_LIST_SORT, GIVEAWAY_REQUEST_STATUS, GIVEAWAY_STATUS } from "./giveaway.type";

const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";
const REQUESTER_ID = "11111111-1111-4111-8111-111111111111";

describe("giveawayService.listGiveaways", () => {
  it("제목 검색과 오래된 순을 repository에 전달하고 LIKE 와일드카드를 이스케이프한다", async () => {
    const originalFindGiveawaysByCursorWithCount =
      giveawayRepository.findGiveawaysByCursorWithCount;
    let receivedParams:
      Parameters<typeof giveawayRepository.findGiveawaysByCursorWithCount>[0] | undefined;

    giveawayRepository.findGiveawaysByCursorWithCount = async (params) => {
      receivedParams = params;

      return {
        giveaways: [],
        totalCount: 0,
      };
    };

    try {
      await giveawayService.listGiveaways({
        limit: 10,
        status: GIVEAWAY_STATUS.AVAILABLE,
        keyword: "100%_test",
        sort: GIVEAWAY_LIST_SORT.OLDEST,
      });
    } finally {
      giveawayRepository.findGiveawaysByCursorWithCount = originalFindGiveawaysByCursorWithCount;
    }

    assert.deepEqual(receivedParams, {
      take: 11,
      where: {
        isHidden: false,
        status: GIVEAWAY_STATUS.AVAILABLE,
        title: {
          contains: "100\\%\\_test",
          mode: "insensitive",
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });

  it("커서가 있으면 디코드한 위치를 repository에 전달한다", async () => {
    const originalFindGiveawaysByCursorWithCount =
      giveawayRepository.findGiveawaysByCursorWithCount;
    let receivedParams:
      Parameters<typeof giveawayRepository.findGiveawaysByCursorWithCount>[0] | undefined;
    const cursorQuery = toGiveawayCursorQuery({
      sort: GIVEAWAY_LIST_SORT.LATEST,
      status: GIVEAWAY_STATUS.AVAILABLE,
    });
    const createdAt = new Date("2026-08-20T00:00:00.000Z");
    const cursor = encodeGiveawayCursor({
      ...cursorQuery,
      createdAt,
      id: 12,
    });

    giveawayRepository.findGiveawaysByCursorWithCount = async (params) => {
      receivedParams = params;

      return {
        giveaways: [],
        totalCount: null,
      };
    };

    try {
      await giveawayService.listGiveaways({
        limit: 10,
        cursor,
        status: GIVEAWAY_STATUS.AVAILABLE,
        sort: GIVEAWAY_LIST_SORT.LATEST,
      });
    } finally {
      giveawayRepository.findGiveawaysByCursorWithCount = originalFindGiveawaysByCursorWithCount;
    }

    assert.deepEqual(receivedParams?.cursor, {
      sort: GIVEAWAY_LIST_SORT.LATEST,
      status: GIVEAWAY_STATUS.AVAILABLE,
      createdAt,
      id: 12,
    });
  });
});

describe("giveawayService.listMyGiveaways", () => {
  it("작성자 글 목록에 처리 상태와 오래된 순을 적용한다", async () => {
    const originalFindGiveawaysByCursorWithCount =
      giveawayRepository.findGiveawaysByCursorWithCount;
    let receivedParams:
      Parameters<typeof giveawayRepository.findGiveawaysByCursorWithCount>[0] | undefined;

    giveawayRepository.findGiveawaysByCursorWithCount = async (params) => {
      receivedParams = params;

      return {
        giveaways: [],
        totalCount: 0,
      };
    };

    try {
      await giveawayService.listMyGiveaways(AUTHOR_ID, {
        limit: 10,
        status: GIVEAWAY_STATUS.IN_PROGRESS,
        sort: GIVEAWAY_LIST_SORT.OLDEST,
      });
    } finally {
      giveawayRepository.findGiveawaysByCursorWithCount = originalFindGiveawaysByCursorWithCount;
    }

    assert.deepEqual(receivedParams, {
      take: 11,
      where: {
        authorId: AUTHOR_ID,
        isHidden: false,
        status: GIVEAWAY_STATUS.IN_PROGRESS,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });
});

describe("giveawayService.listMyGiveawayRequests", () => {
  it("나눔 글 제목 검색, 신청 상태, 최신 순을 repository에 전달한다", async () => {
    const originalFindMyRequestsByCursorWithCount =
      giveawayRepository.findMyRequestsByCursorWithCount;
    let receivedParams:
      Parameters<typeof giveawayRepository.findMyRequestsByCursorWithCount>[0] | undefined;

    giveawayRepository.findMyRequestsByCursorWithCount = async (params) => {
      receivedParams = params;

      return {
        requests: [],
        totalCount: 0,
      };
    };

    try {
      await giveawayService.listMyGiveawayRequests(REQUESTER_ID, {
        limit: 10,
        status: GIVEAWAY_REQUEST_STATUS.PENDING,
        keyword: "책상",
        sort: GIVEAWAY_LIST_SORT.LATEST,
      });
    } finally {
      giveawayRepository.findMyRequestsByCursorWithCount = originalFindMyRequestsByCursorWithCount;
    }

    assert.deepEqual(receivedParams, {
      take: 11,
      where: {
        requesterId: REQUESTER_ID,
        status: GIVEAWAY_REQUEST_STATUS.PENDING,
        giveaway: {
          isHidden: false,
          title: {
            contains: "책상",
            mode: "insensitive",
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  });
});
