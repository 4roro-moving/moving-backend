import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { giveawayRepository } from "./giveaway.repository";
import { giveawayService } from "./giveaway.service";
import { GIVEAWAY_LIST_SORT, GIVEAWAY_REQUEST_STATUS, GIVEAWAY_STATUS } from "./giveaway.type";

const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";
const REQUESTER_ID = "11111111-1111-4111-8111-111111111111";

describe("giveawayService.listGiveaways", () => {
  it("제목 검색과 오래된 순을 repository에 전달하고 LIKE 와일드카드를 이스케이프한다", async () => {
    const originalFindGiveawaysWithCount = giveawayRepository.findGiveawaysWithCount;
    let receivedParams: Parameters<typeof giveawayRepository.findGiveawaysWithCount>[0] | undefined;

    giveawayRepository.findGiveawaysWithCount = async (params) => {
      receivedParams = params;

      return {
        giveaways: [],
        totalCount: 0,
      };
    };

    try {
      await giveawayService.listGiveaways({
        page: 2,
        limit: 10,
        status: GIVEAWAY_STATUS.AVAILABLE,
        keyword: "100%_test",
        sort: GIVEAWAY_LIST_SORT.OLDEST,
      });
    } finally {
      giveawayRepository.findGiveawaysWithCount = originalFindGiveawaysWithCount;
    }

    assert.deepEqual(receivedParams, {
      skip: 10,
      take: 10,
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
});

describe("giveawayService.listMyGiveaways", () => {
  it("작성자 글 목록에 처리 상태와 오래된 순을 적용한다", async () => {
    const originalFindGiveawaysWithCount = giveawayRepository.findGiveawaysWithCount;
    let receivedParams: Parameters<typeof giveawayRepository.findGiveawaysWithCount>[0] | undefined;

    giveawayRepository.findGiveawaysWithCount = async (params) => {
      receivedParams = params;

      return {
        giveaways: [],
        totalCount: 0,
      };
    };

    try {
      await giveawayService.listMyGiveaways(AUTHOR_ID, {
        page: 1,
        limit: 10,
        status: GIVEAWAY_STATUS.IN_PROGRESS,
        sort: GIVEAWAY_LIST_SORT.OLDEST,
      });
    } finally {
      giveawayRepository.findGiveawaysWithCount = originalFindGiveawaysWithCount;
    }

    assert.deepEqual(receivedParams, {
      skip: 0,
      take: 10,
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
    const originalFindMyRequestsWithCount = giveawayRepository.findMyRequestsWithCount;
    let receivedParams:
      Parameters<typeof giveawayRepository.findMyRequestsWithCount>[0] | undefined;

    giveawayRepository.findMyRequestsWithCount = async (params) => {
      receivedParams = params;

      return {
        requests: [],
        totalCount: 0,
      };
    };

    try {
      await giveawayService.listMyGiveawayRequests(REQUESTER_ID, {
        page: 1,
        limit: 10,
        status: GIVEAWAY_REQUEST_STATUS.PENDING,
        keyword: "책상",
        sort: GIVEAWAY_LIST_SORT.LATEST,
      });
    } finally {
      giveawayRepository.findMyRequestsWithCount = originalFindMyRequestsWithCount;
    }

    assert.deepEqual(receivedParams, {
      skip: 0,
      take: 10,
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
