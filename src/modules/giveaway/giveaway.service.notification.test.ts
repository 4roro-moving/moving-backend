import "../../test/profile-image-test-env.js";

import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import type { CreateNotificationInput, NotificationItem } from "../notification/notification.type";
import type {
  GiveawayDetailRow,
  GiveawayOwnershipRow,
  GiveawayRequestRow,
} from "./giveaway.repository";
import { GIVEAWAY_REQUEST_STATUS, GIVEAWAY_STATUS, GIVEAWAY_VISIBILITY } from "./giveaway.type";

const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";
const REQUESTER_ID = "11111111-1111-4111-8111-111111111111";
const GIVEAWAY_ID = 1;
const REQUEST_ID = 10;
const TITLE = "책장 나눔";
const NOW = new Date("2026-08-24T00:00:00.000Z");

const createdNotifications: CreateNotificationInput[] = [];
const sentNotifications: Array<{ userId: string; notification: NotificationItem }> = [];

mock.module("../../utils/transaction", {
  namedExports: {
    runTransaction: async (callback: (tx: { mocked: true }) => Promise<unknown>) =>
      callback({ mocked: true }),
  },
});

mock.module("../notification/notification.service", {
  namedExports: {
    notificationService: {
      createNotification: async (input: CreateNotificationInput) => {
        createdNotifications.push(input);

        return {
          id: createdNotifications.length,
          type: input.type,
          title: input.title,
          content: input.content,
          linkUrl: input.linkUrl ?? null,
          isRead: false,
          readAt: null,
          expiresAt: input.expiresAt,
          createdAt: NOW,
        } satisfies NotificationItem;
      },
      sendNotification: (userId: string, notification: NotificationItem) => {
        sentNotifications.push({ userId, notification });
      },
    },
  },
});

const { giveawayRepository } = await import("./giveaway.repository");
const { giveawayService } = await import("./giveaway.service");

function createOwnership(overrides: Partial<GiveawayOwnershipRow> = {}): GiveawayOwnershipRow {
  return {
    id: GIVEAWAY_ID,
    authorId: AUTHOR_ID,
    receiverId: null,
    status: GIVEAWAY_STATUS.AVAILABLE,
    isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
    title: TITLE,
    ...overrides,
  };
}

function createDetail(overrides: Partial<GiveawayDetailRow> = {}): GiveawayDetailRow {
  return {
    id: GIVEAWAY_ID,
    authorId: AUTHOR_ID,
    receiverId: null,
    title: TITLE,
    description: "설명",
    status: GIVEAWAY_STATUS.AVAILABLE,
    isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
    createdAt: NOW,
    updatedAt: NOW,
    author: { id: AUTHOR_ID, name: "작성자", customerProfile: null },
    receiver: null,
    region: null,
    images: [],
    _count: { requests: 0 },
    ...overrides,
  };
}

function createRequest(overrides: Partial<GiveawayRequestRow> = {}): GiveawayRequestRow {
  return {
    id: REQUEST_ID,
    giveawayId: GIVEAWAY_ID,
    requesterId: REQUESTER_ID,
    status: GIVEAWAY_REQUEST_STATUS.PENDING,
    message: "받고 싶습니다",
    createdAt: NOW,
    updatedAt: NOW,
    requester: { id: REQUESTER_ID, name: "신청자", customerProfile: null },
    ...overrides,
  };
}

function expectedLinkUrl() {
  return `/community/giveaway/${String(GIVEAWAY_ID)}`;
}

function expectedRequestSourceId() {
  return `giveaway-request:${String(REQUEST_ID)}`;
}

function assertSingleNotification(expected: {
  userId: string;
  type: CreateNotificationInput["type"];
  sourceId: string;
  content: string;
}) {
  assert.equal(createdNotifications.length, 1);
  assert.equal(sentNotifications.length, 1);

  const created = createdNotifications[0];
  const sent = sentNotifications[0];

  assert.ok(created);
  assert.ok(sent);
  assert.equal(created.userId, expected.userId);
  assert.equal(created.type, expected.type);
  assert.equal(created.sourceId, expected.sourceId);
  assert.equal(created.linkUrl, expectedLinkUrl());
  assert.equal(created.expiresAt, null);
  assert.equal(created.content, expected.content);
  assert.equal(sent.userId, expected.userId);
  assert.equal(sent.notification.id, 1);
}

const originals = {
  findGiveawayOwnership: giveawayRepository.findGiveawayOwnership,
  findGiveawayById: giveawayRepository.findGiveawayById,
  findActiveRequestByGiveawayAndRequester:
    giveawayRepository.findActiveRequestByGiveawayAndRequester,
  createRequest: giveawayRepository.createRequest,
  findRequestById: giveawayRepository.findRequestById,
  updateRequestStatus: giveawayRepository.updateRequestStatus,
  markGiveawayInProgress: giveawayRepository.markGiveawayInProgress,
  completeGiveaway: giveawayRepository.completeGiveaway,
  restoreGiveawayToAvailable: giveawayRepository.restoreGiveawayToAvailable,
};

afterEach(() => {
  createdNotifications.length = 0;
  sentNotifications.length = 0;
  giveawayRepository.findGiveawayOwnership = originals.findGiveawayOwnership;
  giveawayRepository.findGiveawayById = originals.findGiveawayById;
  giveawayRepository.findActiveRequestByGiveawayAndRequester =
    originals.findActiveRequestByGiveawayAndRequester;
  giveawayRepository.createRequest = originals.createRequest;
  giveawayRepository.findRequestById = originals.findRequestById;
  giveawayRepository.updateRequestStatus = originals.updateRequestStatus;
  giveawayRepository.markGiveawayInProgress = originals.markGiveawayInProgress;
  giveawayRepository.completeGiveaway = originals.completeGiveaway;
  giveawayRepository.restoreGiveawayToAvailable = originals.restoreGiveawayToAvailable;
});

describe("giveawayService 나눔 알림", () => {
  it("신청 성공 시 작성자에게 GIVEAWAY_REQUEST_RECEIVED를 보낸다", async () => {
    giveawayRepository.findGiveawayOwnership = async () => createOwnership();
    giveawayRepository.findActiveRequestByGiveawayAndRequester = async () => null;
    giveawayRepository.createRequest = async () => createRequest();

    await giveawayService.createGiveawayRequest(GIVEAWAY_ID, REQUESTER_ID, {});

    assertSingleNotification({
      userId: AUTHOR_ID,
      type: "GIVEAWAY_REQUEST_RECEIVED",
      sourceId: expectedRequestSourceId(),
      content: `「${TITLE}」에 새로운 신청이 있습니다.`,
    });
  });

  it("선정 성공 시 신청자에게 GIVEAWAY_REQUEST_SELECTED를 보낸다", async () => {
    giveawayRepository.findGiveawayOwnership = async () => createOwnership();
    giveawayRepository.findRequestById = async () => createRequest();
    giveawayRepository.updateRequestStatus = async () => true;
    giveawayRepository.markGiveawayInProgress = async () => true;
    giveawayRepository.findGiveawayById = async () =>
      createDetail({
        receiverId: REQUESTER_ID,
        status: GIVEAWAY_STATUS.IN_PROGRESS,
        receiver: { id: REQUESTER_ID, name: "신청자", customerProfile: null },
      });

    await giveawayService.selectGiveawayRequest(GIVEAWAY_ID, REQUEST_ID, AUTHOR_ID);

    assertSingleNotification({
      userId: REQUESTER_ID,
      type: "GIVEAWAY_REQUEST_SELECTED",
      sourceId: expectedRequestSourceId(),
      content: `「${TITLE}」의 수령자로 선정되었습니다.`,
    });
  });

  it("거절 성공 시 신청자에게 GIVEAWAY_REQUEST_REJECTED를 보낸다", async () => {
    let request = createRequest();

    giveawayRepository.findGiveawayOwnership = async () => createOwnership();
    giveawayRepository.findRequestById = async () => request;
    giveawayRepository.updateRequestStatus = async () => {
      request = createRequest({ status: GIVEAWAY_REQUEST_STATUS.REJECTED });
      return true;
    };

    await giveawayService.rejectGiveawayRequest(GIVEAWAY_ID, REQUEST_ID, AUTHOR_ID);

    assertSingleNotification({
      userId: REQUESTER_ID,
      type: "GIVEAWAY_REQUEST_REJECTED",
      sourceId: expectedRequestSourceId(),
      content: `「${TITLE}」 신청이 거절되었습니다.`,
    });
  });

  it("대기 신청 취소 시 작성자에게 대기 취소 content의 GIVEAWAY_REQUEST_CANCELED를 보낸다", async () => {
    let request = createRequest();

    giveawayRepository.findRequestById = async () => request;
    giveawayRepository.findGiveawayOwnership = async () => createOwnership();
    giveawayRepository.updateRequestStatus = async () => {
      request = createRequest({ status: GIVEAWAY_REQUEST_STATUS.CANCELLED });
      return true;
    };

    await giveawayService.cancelGiveawayRequest(REQUEST_ID, REQUESTER_ID);

    assertSingleNotification({
      userId: AUTHOR_ID,
      type: "GIVEAWAY_REQUEST_CANCELED",
      sourceId: expectedRequestSourceId(),
      content: `「${TITLE}」 신청이 취소되었습니다.`,
    });
  });

  it("선정 신청 취소 시 작성자에게 수령 취소 content의 GIVEAWAY_REQUEST_CANCELED를 보낸다", async () => {
    let request = createRequest({ status: GIVEAWAY_REQUEST_STATUS.SELECTED });

    giveawayRepository.findRequestById = async () => request;
    giveawayRepository.findGiveawayOwnership = async () =>
      createOwnership({
        receiverId: REQUESTER_ID,
        status: GIVEAWAY_STATUS.IN_PROGRESS,
      });
    giveawayRepository.updateRequestStatus = async () => {
      request = createRequest({ status: GIVEAWAY_REQUEST_STATUS.CANCELLED });
      return true;
    };
    giveawayRepository.restoreGiveawayToAvailable = async () => true;

    await giveawayService.cancelGiveawayRequest(REQUEST_ID, REQUESTER_ID);

    assertSingleNotification({
      userId: AUTHOR_ID,
      type: "GIVEAWAY_REQUEST_CANCELED",
      sourceId: expectedRequestSourceId(),
      content: `「${TITLE}」 수령자가 취소해 다시 신청받을 수 있습니다.`,
    });
  });

  it("나눔 완료 시 수령자에게 GIVEAWAY_COMPLETED를 보낸다", async () => {
    giveawayRepository.findGiveawayOwnership = async () =>
      createOwnership({
        receiverId: REQUESTER_ID,
        status: GIVEAWAY_STATUS.IN_PROGRESS,
      });
    giveawayRepository.completeGiveaway = async () => true;
    giveawayRepository.findGiveawayById = async () =>
      createDetail({
        receiverId: REQUESTER_ID,
        status: GIVEAWAY_STATUS.COMPLETED,
        receiver: { id: REQUESTER_ID, name: "신청자", customerProfile: null },
      });

    await giveawayService.completeGiveaway(GIVEAWAY_ID, AUTHOR_ID);

    assertSingleNotification({
      userId: REQUESTER_ID,
      type: "GIVEAWAY_COMPLETED",
      sourceId: `giveaway:${String(GIVEAWAY_ID)}`,
      content: `「${TITLE}」 나눔이 완료되었습니다.`,
    });
  });
});
