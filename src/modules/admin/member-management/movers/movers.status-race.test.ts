import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { EstimateStatus, MoveType, SuspensionAction, UserRole } from "@prisma/client";

import "dotenv/config";

import { AppError } from "../../../../lib/app-error";
import { prisma } from "../../../../lib/prisma";
import { moversService } from "./movers.service";

type Fixture = {
  adminId: string;
  moverId: string;
};

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const [admin, mover] = await Promise.all([
    prisma.user.create({
      data: {
        email: `mover-status-race-admin-${suffix}@test.local`,
        name: "상태경쟁관리자",
        password: "test-password-hash",
        role: UserRole.ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        email: `mover-status-race-mover-${suffix}@test.local`,
        name: "상태경쟁기사",
        password: "test-password-hash",
        role: UserRole.MOVER,
      },
    }),
  ]);

  return { adminId: admin.id, moverId: mover.id };
}

async function cleanupFixture({ adminId, moverId }: Fixture): Promise<void> {
  await prisma.userSuspension.deleteMany({ where: { userId: moverId } });
  await prisma.activityLog.deleteMany({ where: { actorId: adminId, targetId: moverId } });
  await prisma.refreshToken.deleteMany({ where: { userId: moverId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, moverId] } } });
}

const runDbIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "1";

(runDbIntegration ? describe : describe.skip)("기사 상태 변경 경쟁 상황 (PostgreSQL)", () => {
  it("동시 정지 요청 중 하나만 성공하고 이력도 한 번만 저장한다", async () => {
    const fixture = await createFixture();

    try {
      const input = { action: SuspensionAction.SUSPEND, reason: "동시성 테스트" };
      const results = await Promise.allSettled([
        moversService.updateMoverStatus({ ...fixture, input }),
        moversService.updateMoverStatus({ ...fixture, input }),
      ]);

      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.filter((result) => result.status === "rejected").length, 1);

      const rejected = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      assert.ok(rejected?.reason instanceof AppError);
      assert.equal(rejected.reason.code, "MOVER_STATUS_ALREADY_PROCESSED");

      const [mover, suspensionCount, activityLogCount] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: fixture.moverId },
          select: { isActive: true },
        }),
        prisma.userSuspension.count({ where: { userId: fixture.moverId } }),
        prisma.activityLog.count({
          where: { actorId: fixture.adminId, targetId: fixture.moverId },
        }),
      ]);

      assert.equal(mover.isActive, false);
      assert.equal(suspensionCount, 1);
      assert.equal(activityLogCount, 1);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("정지 시 OPEN 요청에 제출한 SENT 견적과 대기 중 수정 요청을 취소한다", async () => {
    const fixture = await createFixture();
    const region = await prisma.region.findFirstOrThrow({ select: { id: true } });
    const customer = await prisma.user.create({
      data: {
        email: `mover-status-customer-${randomUUID()}@test.local`,
        name: "견적고객",
        password: "test-password-hash",
        role: UserRole.CUSTOMER,
      },
    });
    const estimateRequest = await prisma.estimateRequest.create({
      data: {
        customerId: customer.id,
        moveType: MoveType.SMALL,
        moveDate: new Date("2030-01-01T00:00:00.000Z"),
        fromZipCode: "12345",
        fromAddress: "출발지",
        toZipCode: "54321",
        toAddress: "도착지",
        fromRegionId: region.id,
        toRegionId: region.id,
        status: "OPEN",
        expiresAt: new Date("2029-12-31T00:00:00.000Z"),
      },
    });
    const estimate = await prisma.estimate.create({
      data: {
        estimateRequestId: estimateRequest.id,
        moverId: fixture.moverId,
        price: 100_000,
        comment: "정지 처리로 취소되는 테스트 견적입니다.",
      },
    });
    const chatRoom = await prisma.chatRoom.create({
      data: {
        estimateRequestId: estimateRequest.id,
        estimateId: estimate.id,
        customerId: customer.id,
        moverId: fixture.moverId,
      },
    });
    await prisma.estimateRevision.create({
      data: {
        chatRoomId: chatRoom.id,
        estimateId: estimate.id,
        requesterId: customer.id,
        previousPrice: 100_000,
        requestedPrice: 120_000,
        previousComment: "정지 전 견적 내용입니다.",
        requestedComment: "정지 전 수정 요청 내용입니다.",
      },
    });

    try {
      await moversService.updateMoverStatus({
        ...fixture,
        input: { action: SuspensionAction.SUSPEND, reason: "운영 정책 위반" },
      });

      const [updatedEstimate, notification, pendingRevisionCount] = await Promise.all([
        prisma.estimate.findUniqueOrThrow({
          where: { id: estimate.id },
          select: { status: true, canceledAt: true },
        }),
        prisma.notification.findUnique({
          where: {
            userId_type_sourceId: {
              userId: customer.id,
              type: "ESTIMATE_CANCELED_BY_ACCOUNT_SUSPENSION",
              sourceId: `admin-suspend-mover:${fixture.moverId}:${String(estimate.id)}`,
            },
          },
        }),
        prisma.estimateRevision.count({
          where: { estimateId: estimate.id, status: "PENDING" },
        }),
      ]);

      assert.equal(updatedEstimate.status, EstimateStatus.CANCELED);
      assert.ok(updatedEstimate.canceledAt);
      assert.ok(notification);
      assert.equal(pendingRevisionCount, 0);
    } finally {
      await prisma.userSuspension.deleteMany({ where: { userId: fixture.moverId } });
      await prisma.activityLog.deleteMany({
        where: { actorId: fixture.adminId, targetId: fixture.moverId },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: fixture.moverId } });
      await prisma.user.deleteMany({
        where: { id: { in: [customer.id, fixture.adminId, fixture.moverId] } },
      });
    }
  });
});
