import { AppError } from "../../lib/app-error";
import { GIVEAWAY_REQUEST_STATUS, GIVEAWAY_STATUS, GIVEAWAY_VISIBILITY } from "./giveaway.type";
import type { GiveawayOwnershipRow, GiveawayRequestRow } from "./giveaway.repository";

export function assertGiveawayVisible<T extends { isHidden: boolean }>(
  giveaway: T | null,
): asserts giveaway is T {
  if (!giveaway || giveaway.isHidden === GIVEAWAY_VISIBILITY.HIDDEN) {
    throw new AppError("GIVEAWAY_NOT_FOUND", {
      message: "나눔 글을 찾을 수 없습니다.",
    });
  }
}

export function assertGiveawayAuthor(giveaway: GiveawayOwnershipRow, userId: string) {
  if (giveaway.authorId !== userId) {
    throw new AppError("FORBIDDEN", {
      message: "본인이 작성한 나눔 글만 처리할 수 있습니다.",
    });
  }
}

export function assertGiveawayEditable(giveaway: GiveawayOwnershipRow) {
  if (giveaway.status !== GIVEAWAY_STATUS.AVAILABLE) {
    throw new AppError("GIVEAWAY_NOT_EDITABLE", {
      message: "신청 가능 상태의 나눔 글만 수정할 수 있습니다.",
    });
  }
}

export function assertGiveawayDeletable(giveaway: GiveawayOwnershipRow) {
  if (giveaway.status !== GIVEAWAY_STATUS.AVAILABLE) {
    throw new AppError("GIVEAWAY_NOT_DELETABLE", {
      message: "신청 가능 상태의 나눔 글만 삭제할 수 있습니다.",
    });
  }
}

export function assertCanRequestGiveaway(giveaway: GiveawayOwnershipRow, requesterId: string) {
  assertGiveawayVisible(giveaway);

  if (giveaway.authorId === requesterId) {
    throw new AppError("GIVEAWAY_SELF_REQUEST_NOT_ALLOWED", {
      message: "본인이 작성한 나눔 글에는 신청할 수 없습니다.",
    });
  }

  if (giveaway.status !== GIVEAWAY_STATUS.AVAILABLE) {
    throw new AppError("GIVEAWAY_NOT_REQUESTABLE", {
      message: "신청 가능 상태의 나눔 글에만 신청할 수 있습니다.",
    });
  }
}

export function assertRequestOwner(request: GiveawayRequestRow, requesterId: string) {
  if (request.requesterId !== requesterId) {
    throw new AppError("FORBIDDEN", {
      message: "본인의 나눔 신청만 처리할 수 있습니다.",
    });
  }
}

export function assertRequestMessageEditable(request: GiveawayRequestRow) {
  if (request.status !== GIVEAWAY_REQUEST_STATUS.PENDING) {
    throw new AppError("GIVEAWAY_REQUEST_NOT_EDITABLE", {
      message: "대기 중인 신청만 메시지를 수정할 수 있습니다.",
    });
  }
}

export function assertRequestCancellable(
  request: GiveawayRequestRow,
  giveaway: GiveawayOwnershipRow,
) {
  if (
    request.status !== GIVEAWAY_REQUEST_STATUS.PENDING &&
    request.status !== GIVEAWAY_REQUEST_STATUS.SELECTED
  ) {
    throw new AppError("GIVEAWAY_REQUEST_CANCEL_NOT_ALLOWED", {
      message: "대기 중이거나 선정된 신청만 취소할 수 있습니다.",
    });
  }

  if (
    request.status === GIVEAWAY_REQUEST_STATUS.SELECTED &&
    giveaway.status !== GIVEAWAY_STATUS.IN_PROGRESS
  ) {
    throw new AppError("GIVEAWAY_REQUEST_CANCEL_NOT_ALLOWED", {
      message: "진행 중인 나눔의 선정 신청만 취소할 수 있습니다.",
    });
  }
}

export function assertRequestSelectable(
  giveaway: GiveawayOwnershipRow,
  request: GiveawayRequestRow,
) {
  assertGiveawayVisible(giveaway);

  if (giveaway.status !== GIVEAWAY_STATUS.AVAILABLE) {
    throw new AppError("GIVEAWAY_RECEIVER_ALREADY_SELECTED", {
      message: "이미 수령자가 선정된 나눔입니다.",
    });
  }

  if (request.giveawayId !== giveaway.id) {
    throw new AppError("GIVEAWAY_REQUEST_NOT_FOUND", {
      message: "해당 나눔 글의 신청을 찾을 수 없습니다.",
    });
  }

  if (request.status !== GIVEAWAY_REQUEST_STATUS.PENDING) {
    throw new AppError("GIVEAWAY_REQUEST_NOT_SELECTABLE", {
      message: "대기 중인 신청만 선정할 수 있습니다.",
    });
  }
}

export function assertRequestRejectable(
  giveaway: GiveawayOwnershipRow,
  request: GiveawayRequestRow,
) {
  if (request.giveawayId !== giveaway.id) {
    throw new AppError("GIVEAWAY_REQUEST_NOT_FOUND", {
      message: "해당 나눔 글의 신청을 찾을 수 없습니다.",
    });
  }

  if (request.status !== GIVEAWAY_REQUEST_STATUS.PENDING) {
    throw new AppError("GIVEAWAY_REQUEST_NOT_REJECTABLE", {
      message: "대기 중인 신청만 거절할 수 있습니다.",
    });
  }
}

export function assertGiveawayCompletable(giveaway: GiveawayOwnershipRow) {
  if (giveaway.status !== GIVEAWAY_STATUS.IN_PROGRESS || !giveaway.receiverId) {
    throw new AppError("GIVEAWAY_NOT_COMPLETABLE", {
      message: "진행 중인 나눔만 완료할 수 있습니다.",
    });
  }
}
