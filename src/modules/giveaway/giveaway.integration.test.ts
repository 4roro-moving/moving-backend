import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { GiveawayRequestStatus, GiveawayStatus, UserRole } from "@prisma/client";

import "dotenv/config";

import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import { giveawayService } from "./giveaway.service";
import { GIVEAWAY_REQUEST_STATUS } from "./giveaway.type";

type SelectRaceFixture = {
  authorId: string;
  requesterAId: string;
  requesterBId: string;
  giveawayId: number;
  requestAId: number;
  requestBId: number;
};

type ReapplyFixture = {
  authorId: string;
  requesterId: string;
  giveawayId: number;
};

async function createCustomer(label: string, suffix: string) {
  return prisma.user.create({
    data: {
      email: `giveaway-${label}-${suffix}@test.local`,
      name: label,
      password: "test-password-hash",
      role: UserRole.CUSTOMER,
      isActive: true,
      isProfileCompleted: true,
    },
  });
}

async function createGiveaway(authorId: string, suffix: string) {
  return prisma.giveaway.create({
    data: {
      authorId,
      title: `나눔 동시성 ${suffix}`,
      description: "동시 선정 및 재신청 통합 테스트용 나눔 글입니다.",
      status: GiveawayStatus.AVAILABLE,
    },
  });
}

async function createPendingRequest(giveawayId: number, requesterId: string, message: string) {
  return prisma.giveawayRequest.create({
    data: {
      giveawayId,
      requesterId,
      status: GiveawayRequestStatus.PENDING,
      message,
    },
  });
}

async function createSelectRaceFixture(): Promise<SelectRaceFixture> {
  const suffix = randomUUID().slice(0, 8);
  const [author, requesterA, requesterB] = await Promise.all([
    createCustomer("select-author", suffix),
    createCustomer("select-requester-a", suffix),
    createCustomer("select-requester-b", suffix),
  ]);
  const giveaway = await createGiveaway(author.id, suffix);
  const [requestA, requestB] = await Promise.all([
    createPendingRequest(giveaway.id, requesterA.id, "신청 A"),
    createPendingRequest(giveaway.id, requesterB.id, "신청 B"),
  ]);

  return {
    authorId: author.id,
    requesterAId: requesterA.id,
    requesterBId: requesterB.id,
    giveawayId: giveaway.id,
    requestAId: requestA.id,
    requestBId: requestB.id,
  };
}

async function createReapplyFixture(): Promise<ReapplyFixture> {
  const suffix = randomUUID().slice(0, 8);
  const [author, requester] = await Promise.all([
    createCustomer("reapply-author", suffix),
    createCustomer("reapply-requester", suffix),
  ]);
  const giveaway = await createGiveaway(author.id, suffix);

  return {
    authorId: author.id,
    requesterId: requester.id,
    giveawayId: giveaway.id,
  };
}

async function cleanupUsers(userIds: string[]) {
  await prisma.giveaway.deleteMany({
    where: { authorId: { in: userIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
}

function isAppError(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}

const runDbIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "1";

(runDbIntegration ? describe : describe.skip)("나눔 신청 재신청 (PostgreSQL)", () => {
  it("CANCELLED 이후에는 새 PENDING 신청으로 재신청할 수 있다", async () => {
    const fixture = await createReapplyFixture();

    try {
      const first = await giveawayService.createGiveawayRequest(
        fixture.giveawayId,
        fixture.requesterId,
        {
          message: "첫 신청",
        },
      );

      await giveawayService.cancelGiveawayRequest(first.id, fixture.requesterId);

      const afterCancel = await giveawayService.getGiveawayDetail(
        fixture.giveawayId,
        fixture.requesterId,
      );
      assert.equal(afterCancel.myRequest?.status, GIVEAWAY_REQUEST_STATUS.CANCELLED);
      assert.equal(afterCancel.canRequest, true);

      const second = await giveawayService.createGiveawayRequest(
        fixture.giveawayId,
        fixture.requesterId,
        {
          message: "재신청",
        },
      );

      assert.notEqual(second.id, first.id);
      assert.equal(second.status, GIVEAWAY_REQUEST_STATUS.PENDING);
      assert.equal(second.message, "재신청");

      const [firstRow, secondRow, detail] = await Promise.all([
        prisma.giveawayRequest.findUniqueOrThrow({ where: { id: first.id } }),
        prisma.giveawayRequest.findUniqueOrThrow({ where: { id: second.id } }),
        giveawayService.getGiveawayDetail(fixture.giveawayId, fixture.requesterId),
      ]);

      assert.equal(firstRow.status, GiveawayRequestStatus.CANCELLED);
      assert.equal(secondRow.status, GiveawayRequestStatus.PENDING);
      assert.equal(detail.myRequest?.id, second.id);
      assert.equal(detail.myRequest?.status, GIVEAWAY_REQUEST_STATUS.PENDING);
      assert.equal(detail.canRequest, false);
    } finally {
      await cleanupUsers([fixture.authorId, fixture.requesterId]);
    }
  });

  it("REJECTED 이후에도 새 PENDING 신청으로 재신청할 수 있다", async () => {
    const fixture = await createReapplyFixture();

    try {
      const first = await giveawayService.createGiveawayRequest(
        fixture.giveawayId,
        fixture.requesterId,
        {
          message: "첫 신청",
        },
      );

      await giveawayService.rejectGiveawayRequest(fixture.giveawayId, first.id, fixture.authorId);

      const afterReject = await giveawayService.getGiveawayDetail(
        fixture.giveawayId,
        fixture.requesterId,
      );
      assert.equal(afterReject.myRequest?.status, GIVEAWAY_REQUEST_STATUS.REJECTED);
      assert.equal(afterReject.canRequest, true);

      const second = await giveawayService.createGiveawayRequest(
        fixture.giveawayId,
        fixture.requesterId,
        {
          message: "거절 후 재신청",
        },
      );

      assert.notEqual(second.id, first.id);
      assert.equal(second.status, GIVEAWAY_REQUEST_STATUS.PENDING);

      const firstRow = await prisma.giveawayRequest.findUniqueOrThrow({
        where: { id: first.id },
      });
      assert.equal(firstRow.status, GiveawayRequestStatus.REJECTED);
    } finally {
      await cleanupUsers([fixture.authorId, fixture.requesterId]);
    }
  });

  it("PENDING 신청이 있으면 같은 글에 재신청할 수 없다", async () => {
    const fixture = await createReapplyFixture();

    try {
      await giveawayService.createGiveawayRequest(fixture.giveawayId, fixture.requesterId, {
        message: "진행 중 신청",
      });

      const detail = await giveawayService.getGiveawayDetail(
        fixture.giveawayId,
        fixture.requesterId,
      );
      assert.equal(detail.canRequest, false);

      await assert.rejects(
        () =>
          giveawayService.createGiveawayRequest(fixture.giveawayId, fixture.requesterId, {
            message: "중복 신청",
          }),
        isAppError("GIVEAWAY_REQUEST_ALREADY_EXISTS"),
      );

      const count = await prisma.giveawayRequest.count({
        where: { giveawayId: fixture.giveawayId, requesterId: fixture.requesterId },
      });
      assert.equal(count, 1);
    } finally {
      await cleanupUsers([fixture.authorId, fixture.requesterId]);
    }
  });
});

(runDbIntegration ? describe : describe.skip)("나눔 수령자 동시 선정 (PostgreSQL)", () => {
  it("서로 다른 PENDING 2건을 동시에 선정하면 1건만 SELECTED가 된다", async () => {
    const fixture = await createSelectRaceFixture();

    try {
      const results = await Promise.allSettled([
        giveawayService.selectGiveawayRequest(
          fixture.giveawayId,
          fixture.requestAId,
          fixture.authorId,
        ),
        giveawayService.selectGiveawayRequest(
          fixture.giveawayId,
          fixture.requestBId,
          fixture.authorId,
        ),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      assert.ok(fulfilled.length <= 1, "선정 성공은 최대 1건이어야 합니다.");
      assert.equal(rejected.length, results.length - fulfilled.length);

      for (const result of rejected) {
        assert.ok(result.reason instanceof AppError);
        assert.equal(result.reason.code, "GIVEAWAY_RECEIVER_ALREADY_SELECTED");
      }

      const [giveaway, requestA, requestB] = await Promise.all([
        prisma.giveaway.findUniqueOrThrow({
          where: { id: fixture.giveawayId },
          select: { status: true, receiverId: true },
        }),
        prisma.giveawayRequest.findUniqueOrThrow({ where: { id: fixture.requestAId } }),
        prisma.giveawayRequest.findUniqueOrThrow({ where: { id: fixture.requestBId } }),
      ]);

      const selected = [requestA, requestB].filter(
        (request) => request.status === GiveawayRequestStatus.SELECTED,
      );
      const pending = [requestA, requestB].filter(
        (request) => request.status === GiveawayRequestStatus.PENDING,
      );

      assert.equal(selected.length, 1);
      assert.equal(pending.length, 1);
      assert.equal(giveaway.status, GiveawayStatus.IN_PROGRESS);
      assert.equal(giveaway.receiverId, selected[0]?.requesterId);
      assert.ok(
        giveaway.receiverId === fixture.requesterAId ||
          giveaway.receiverId === fixture.requesterBId,
      );
    } finally {
      await cleanupUsers([fixture.authorId, fixture.requesterAId, fixture.requesterBId]);
    }
  });
});
