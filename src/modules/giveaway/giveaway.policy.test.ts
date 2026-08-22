import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError } from "../../lib/app-error";
import {
  assertCanRequestGiveaway,
  assertGiveawayAuthor,
  assertGiveawayCompletable,
  assertGiveawayDeletable,
  assertGiveawayEditable,
  assertGiveawayNotCompleted,
  assertGiveawayVisible,
  assertRequestCancellable,
  assertRequestMessageEditable,
  assertRequestOwner,
  assertRequestRejectable,
  assertRequestSelectable,
  canRequestGiveaway,
} from "./giveaway.policy";
import type { GiveawayOwnershipRow, GiveawayRequestRow } from "./giveaway.repository";
import { GIVEAWAY_REQUEST_STATUS, GIVEAWAY_STATUS, GIVEAWAY_VISIBILITY } from "./giveaway.type";

const availableGiveaway: GiveawayOwnershipRow = {
  id: 1,
  authorId: "author-1",
  receiverId: null,
  status: GIVEAWAY_STATUS.AVAILABLE,
  isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
};

const hiddenGiveaway: GiveawayOwnershipRow = {
  ...availableGiveaway,
  isHidden: GIVEAWAY_VISIBILITY.HIDDEN,
};

const inProgressGiveaway: GiveawayOwnershipRow = {
  ...availableGiveaway,
  receiverId: "requester-1",
  status: GIVEAWAY_STATUS.IN_PROGRESS,
};

const completedGiveaway: GiveawayOwnershipRow = {
  ...inProgressGiveaway,
  status: GIVEAWAY_STATUS.COMPLETED,
};

function createRequest(overrides: Partial<GiveawayRequestRow> = {}): GiveawayRequestRow {
  return {
    id: 10,
    giveawayId: 1,
    requesterId: "requester-1",
    status: GIVEAWAY_REQUEST_STATUS.PENDING,
    message: "받고 싶습니다",
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
    updatedAt: new Date("2026-08-18T00:00:00.000Z"),
    requester: { id: "requester-1", name: "신청자", customerProfile: null },
    ...overrides,
  };
}

function isAppError(code: string, status?: number) {
  return (error: unknown) =>
    error instanceof AppError &&
    error.code === code &&
    (status === undefined || error.status === status);
}

describe("assertGiveawayVisible", () => {
  it("보이는 글은 통과한다", () => {
    assert.doesNotThrow(() => assertGiveawayVisible(availableGiveaway));
  });

  it("없으면 GIVEAWAY_NOT_FOUND", () => {
    assert.throws(() => assertGiveawayVisible(null), isAppError("GIVEAWAY_NOT_FOUND"));
  });

  it("숨김 글은 GIVEAWAY_NOT_FOUND", () => {
    assert.throws(() => assertGiveawayVisible(hiddenGiveaway), isAppError("GIVEAWAY_NOT_FOUND"));
  });
});

describe("assertGiveawayAuthor", () => {
  it("작성자면 통과한다", () => {
    assert.doesNotThrow(() => assertGiveawayAuthor(availableGiveaway, "author-1"));
  });

  it("작성자가 아니면 FORBIDDEN", () => {
    assert.throws(
      () => assertGiveawayAuthor(availableGiveaway, "requester-1"),
      isAppError("FORBIDDEN"),
    );
  });
});

describe("assertGiveawayNotCompleted", () => {
  it("AVAILABLE·IN_PROGRESS는 통과한다", () => {
    assert.doesNotThrow(() => assertGiveawayNotCompleted(availableGiveaway));
    assert.doesNotThrow(() => assertGiveawayNotCompleted(inProgressGiveaway));
  });

  it("COMPLETED면 GIVEAWAY_ALREADY_COMPLETED", () => {
    assert.throws(
      () => assertGiveawayNotCompleted(completedGiveaway),
      isAppError("GIVEAWAY_ALREADY_COMPLETED"),
    );
  });
});

describe("assertGiveawayEditable / assertGiveawayDeletable", () => {
  it("AVAILABLE만 수정·삭제할 수 있다", () => {
    assert.doesNotThrow(() => assertGiveawayEditable(availableGiveaway));
    assert.doesNotThrow(() => assertGiveawayDeletable(availableGiveaway));
  });

  it("IN_PROGRESS는 NOT_EDITABLE / NOT_DELETABLE", () => {
    assert.throws(
      () => assertGiveawayEditable(inProgressGiveaway),
      isAppError("GIVEAWAY_NOT_EDITABLE"),
    );
    assert.throws(
      () => assertGiveawayDeletable(inProgressGiveaway),
      isAppError("GIVEAWAY_NOT_DELETABLE"),
    );
  });

  it("COMPLETED는 GIVEAWAY_ALREADY_COMPLETED", () => {
    assert.throws(
      () => assertGiveawayEditable(completedGiveaway),
      isAppError("GIVEAWAY_ALREADY_COMPLETED"),
    );
    assert.throws(
      () => assertGiveawayDeletable(completedGiveaway),
      isAppError("GIVEAWAY_ALREADY_COMPLETED"),
    );
  });

  it("숨김 글 수정은 GIVEAWAY_NOT_FOUND", () => {
    assert.throws(() => assertGiveawayEditable(hiddenGiveaway), isAppError("GIVEAWAY_NOT_FOUND"));
  });
});

describe("assertCanRequestGiveaway", () => {
  it("다른 사용자의 AVAILABLE 글은 신청할 수 있다", () => {
    assert.doesNotThrow(() => assertCanRequestGiveaway(availableGiveaway, "requester-1"));
  });

  it("숨김 글은 GIVEAWAY_NOT_FOUND", () => {
    assert.throws(
      () => assertCanRequestGiveaway(hiddenGiveaway, "requester-1"),
      isAppError("GIVEAWAY_NOT_FOUND"),
    );
  });

  it("본인 글은 GIVEAWAY_SELF_REQUEST_NOT_ALLOWED", () => {
    assert.throws(
      () => assertCanRequestGiveaway(availableGiveaway, "author-1"),
      isAppError("GIVEAWAY_SELF_REQUEST_NOT_ALLOWED"),
    );
  });

  it("IN_PROGRESS는 GIVEAWAY_NOT_REQUESTABLE", () => {
    assert.throws(
      () => assertCanRequestGiveaway(inProgressGiveaway, "requester-2"),
      isAppError("GIVEAWAY_NOT_REQUESTABLE"),
    );
  });

  it("COMPLETED는 GIVEAWAY_ALREADY_COMPLETED", () => {
    assert.throws(
      () => assertCanRequestGiveaway(completedGiveaway, "requester-2"),
      isAppError("GIVEAWAY_ALREADY_COMPLETED"),
    );
  });
});

describe("canRequestGiveaway", () => {
  it("신청 이력이 없는 AVAILABLE 글은 true", () => {
    assert.equal(canRequestGiveaway(availableGiveaway, "requester-1", null), true);
  });

  it("CANCELLED·REJECTED 이후에는 true", () => {
    assert.equal(
      canRequestGiveaway(
        availableGiveaway,
        "requester-1",
        createRequest({ status: GIVEAWAY_REQUEST_STATUS.CANCELLED }),
      ),
      true,
    );
    assert.equal(
      canRequestGiveaway(
        availableGiveaway,
        "requester-1",
        createRequest({ status: GIVEAWAY_REQUEST_STATUS.REJECTED }),
      ),
      true,
    );
  });

  it("PENDING·SELECTED면 false", () => {
    assert.equal(canRequestGiveaway(availableGiveaway, "requester-1", createRequest()), false);
    assert.equal(
      canRequestGiveaway(
        availableGiveaway,
        "requester-1",
        createRequest({ status: GIVEAWAY_REQUEST_STATUS.SELECTED }),
      ),
      false,
    );
  });

  it("작성자·IN_PROGRESS·COMPLETED·숨김 글은 false", () => {
    assert.equal(canRequestGiveaway(availableGiveaway, "author-1", null), false);
    assert.equal(canRequestGiveaway(inProgressGiveaway, "requester-2", null), false);
    assert.equal(canRequestGiveaway(completedGiveaway, "requester-2", null), false);
    assert.equal(canRequestGiveaway(hiddenGiveaway, "requester-1", null), false);
  });
});

describe("assertRequestOwner", () => {
  it("신청자면 통과한다", () => {
    assert.doesNotThrow(() => assertRequestOwner(createRequest(), "requester-1"));
  });

  it("신청자가 아니면 FORBIDDEN", () => {
    assert.throws(() => assertRequestOwner(createRequest(), "other-1"), isAppError("FORBIDDEN"));
  });
});

describe("assertRequestMessageEditable", () => {
  it("AVAILABLE의 PENDING 신청은 수정할 수 있다", () => {
    assert.doesNotThrow(() => assertRequestMessageEditable(createRequest(), availableGiveaway));
  });

  it("IN_PROGRESS의 PENDING 신청도 수정할 수 있다", () => {
    assert.doesNotThrow(() => assertRequestMessageEditable(createRequest(), inProgressGiveaway));
  });

  it("PENDING이 아니면 GIVEAWAY_REQUEST_NOT_EDITABLE", () => {
    assert.throws(
      () =>
        assertRequestMessageEditable(
          createRequest({ status: GIVEAWAY_REQUEST_STATUS.SELECTED }),
          inProgressGiveaway,
        ),
      isAppError("GIVEAWAY_REQUEST_NOT_EDITABLE"),
    );
  });

  it("COMPLETED는 GIVEAWAY_ALREADY_COMPLETED", () => {
    assert.throws(
      () => assertRequestMessageEditable(createRequest(), completedGiveaway),
      isAppError("GIVEAWAY_ALREADY_COMPLETED"),
    );
  });
});

describe("assertRequestCancellable", () => {
  it("PENDING은 AVAILABLE에서 취소할 수 있다", () => {
    assert.doesNotThrow(() => assertRequestCancellable(createRequest(), availableGiveaway));
  });

  it("PENDING은 IN_PROGRESS에서도 취소할 수 있다", () => {
    assert.doesNotThrow(() => assertRequestCancellable(createRequest(), inProgressGiveaway));
  });

  it("SELECTED는 IN_PROGRESS에서 취소할 수 있다", () => {
    assert.doesNotThrow(() =>
      assertRequestCancellable(
        createRequest({ status: GIVEAWAY_REQUEST_STATUS.SELECTED }),
        inProgressGiveaway,
      ),
    );
  });

  it("REJECTED·CANCELLED는 GIVEAWAY_REQUEST_CANCEL_NOT_ALLOWED", () => {
    assert.throws(
      () =>
        assertRequestCancellable(
          createRequest({ status: GIVEAWAY_REQUEST_STATUS.REJECTED }),
          availableGiveaway,
        ),
      isAppError("GIVEAWAY_REQUEST_CANCEL_NOT_ALLOWED"),
    );
    assert.throws(
      () =>
        assertRequestCancellable(
          createRequest({ status: GIVEAWAY_REQUEST_STATUS.CANCELLED }),
          availableGiveaway,
        ),
      isAppError("GIVEAWAY_REQUEST_CANCEL_NOT_ALLOWED"),
    );
  });

  it("SELECTED를 AVAILABLE에서 취소하면 GIVEAWAY_REQUEST_CANCEL_NOT_ALLOWED", () => {
    assert.throws(
      () =>
        assertRequestCancellable(
          createRequest({ status: GIVEAWAY_REQUEST_STATUS.SELECTED }),
          availableGiveaway,
        ),
      isAppError("GIVEAWAY_REQUEST_CANCEL_NOT_ALLOWED"),
    );
  });

  it("COMPLETED는 GIVEAWAY_ALREADY_COMPLETED", () => {
    assert.throws(
      () => assertRequestCancellable(createRequest(), completedGiveaway),
      isAppError("GIVEAWAY_ALREADY_COMPLETED"),
    );
    assert.throws(
      () =>
        assertRequestCancellable(
          createRequest({ status: GIVEAWAY_REQUEST_STATUS.SELECTED }),
          completedGiveaway,
        ),
      isAppError("GIVEAWAY_ALREADY_COMPLETED"),
    );
  });
});

describe("assertRequestSelectable", () => {
  it("AVAILABLE의 PENDING 신청은 선정할 수 있다", () => {
    assert.doesNotThrow(() => assertRequestSelectable(availableGiveaway, createRequest()));
  });

  it("숨김 글은 GIVEAWAY_NOT_FOUND", () => {
    assert.throws(
      () => assertRequestSelectable(hiddenGiveaway, createRequest()),
      isAppError("GIVEAWAY_NOT_FOUND"),
    );
  });

  it("IN_PROGRESS는 GIVEAWAY_RECEIVER_ALREADY_SELECTED", () => {
    assert.throws(
      () => assertRequestSelectable(inProgressGiveaway, createRequest()),
      isAppError("GIVEAWAY_RECEIVER_ALREADY_SELECTED", 409),
    );
  });

  it("COMPLETED는 GIVEAWAY_ALREADY_COMPLETED", () => {
    assert.throws(
      () => assertRequestSelectable(completedGiveaway, createRequest()),
      isAppError("GIVEAWAY_ALREADY_COMPLETED"),
    );
  });

  it("다른 글의 신청은 GIVEAWAY_REQUEST_NOT_FOUND", () => {
    assert.throws(
      () => assertRequestSelectable(availableGiveaway, createRequest({ giveawayId: 99 })),
      isAppError("GIVEAWAY_REQUEST_NOT_FOUND"),
    );
  });

  it("PENDING이 아니면 GIVEAWAY_REQUEST_NOT_SELECTABLE", () => {
    assert.throws(
      () =>
        assertRequestSelectable(
          availableGiveaway,
          createRequest({ status: GIVEAWAY_REQUEST_STATUS.REJECTED }),
        ),
      isAppError("GIVEAWAY_REQUEST_NOT_SELECTABLE"),
    );
  });
});

describe("assertRequestRejectable", () => {
  it("AVAILABLE의 PENDING 신청은 거절할 수 있다", () => {
    assert.doesNotThrow(() => assertRequestRejectable(availableGiveaway, createRequest()));
  });

  it("IN_PROGRESS의 PENDING 신청도 거절할 수 있다", () => {
    assert.doesNotThrow(() => assertRequestRejectable(inProgressGiveaway, createRequest()));
  });

  it("숨김 글은 GIVEAWAY_NOT_FOUND", () => {
    assert.throws(
      () => assertRequestRejectable(hiddenGiveaway, createRequest()),
      isAppError("GIVEAWAY_NOT_FOUND"),
    );
  });

  it("COMPLETED는 GIVEAWAY_ALREADY_COMPLETED", () => {
    assert.throws(
      () => assertRequestRejectable(completedGiveaway, createRequest()),
      isAppError("GIVEAWAY_ALREADY_COMPLETED"),
    );
  });

  it("다른 글의 신청은 GIVEAWAY_REQUEST_NOT_FOUND", () => {
    assert.throws(
      () => assertRequestRejectable(availableGiveaway, createRequest({ giveawayId: 99 })),
      isAppError("GIVEAWAY_REQUEST_NOT_FOUND"),
    );
  });

  it("PENDING이 아니면 GIVEAWAY_REQUEST_NOT_REJECTABLE", () => {
    assert.throws(
      () =>
        assertRequestRejectable(
          inProgressGiveaway,
          createRequest({ status: GIVEAWAY_REQUEST_STATUS.SELECTED }),
        ),
      isAppError("GIVEAWAY_REQUEST_NOT_REJECTABLE"),
    );
    assert.throws(
      () =>
        assertRequestRejectable(
          availableGiveaway,
          createRequest({ status: GIVEAWAY_REQUEST_STATUS.REJECTED }),
        ),
      isAppError("GIVEAWAY_REQUEST_NOT_REJECTABLE"),
    );
  });
});

describe("assertGiveawayCompletable", () => {
  it("IN_PROGRESS이고 수령자가 있으면 완료할 수 있다", () => {
    assert.doesNotThrow(() => assertGiveawayCompletable(inProgressGiveaway));
  });

  it("AVAILABLE은 GIVEAWAY_NOT_COMPLETABLE", () => {
    assert.throws(
      () => assertGiveawayCompletable(availableGiveaway),
      isAppError("GIVEAWAY_NOT_COMPLETABLE"),
    );
  });

  it("COMPLETED는 GIVEAWAY_NOT_COMPLETABLE", () => {
    assert.throws(
      () => assertGiveawayCompletable(completedGiveaway),
      isAppError("GIVEAWAY_NOT_COMPLETABLE"),
    );
  });

  it("수령자가 없으면 GIVEAWAY_NOT_COMPLETABLE", () => {
    assert.throws(
      () => assertGiveawayCompletable({ ...inProgressGiveaway, receiverId: null }),
      isAppError("GIVEAWAY_NOT_COMPLETABLE"),
    );
  });
});
