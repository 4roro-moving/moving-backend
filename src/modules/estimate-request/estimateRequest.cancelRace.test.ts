import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import type { Prisma } from "@prisma/client";

import "dotenv/config";

import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import { lockEstimateRequestForUpdate } from "../../utils/estimate-request-lock.util";
import { estimateRequestService } from "./estimateRequest.service";
import { moverEstimateRequestService } from "../estimate/mover/mover-estimate.service";

/**
 * 잠금 헬퍼 단위 테스트 + (옵션) PostgreSQL 경쟁 통합 테스트.
 *
 * 통합 테스트 실행: `npm run test:db`
 * 기본 `npm test` 에서는 DB 통합 suite 를 skip 합니다.
 * // 2026.08.03 정슬기 - [추가]
 * // 2026.08.03 정슬기 - [수정] CodeRabbit 리뷰 — 실제 FOR UPDATE 경쟁 통합 테스트 추가
 */
describe("lockEstimateRequestForUpdate (unit)", () => {
  it("행이 없으면 false (NOT_FOUND 분기)", async () => {
    const db = {
      $queryRaw: async () => [],
    } as unknown as Prisma.TransactionClient;

    assert.equal(await lockEstimateRequestForUpdate(db, 999), false);
  });

  it("행이 있으면 true (이후 상태 재검증·쓰기 진행)", async () => {
    const db = {
      $queryRaw: async () => [{ id: 1 }],
    } as unknown as Prisma.TransactionClient;

    assert.equal(await lockEstimateRequestForUpdate(db, 1), true);
  });
});

type RaceFixture = {
  customerId: string;
  moverId: string;
  requestId: number;
  customerEmail: string;
  moverEmail: string;
  moverNickname: string;
};

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function createRaceFixture(): Promise<RaceFixture> {
  const suffix = randomUUID().slice(0, 8);
  const customerEmail = `cancel-race-customer-${suffix}@test.local`;
  const moverEmail = `cancel-race-mover-${suffix}@test.local`;
  const moverNickname = `race-mover-${suffix}`;

  const region =
    (await prisma.region.findFirst({ where: { name: "서울" } })) ??
    (await prisma.region.create({ data: { name: `서울-race-${suffix}` } }));

  const customer = await prisma.user.create({
    data: {
      email: customerEmail,
      name: "취소경쟁고객",
      role: "CUSTOMER",
      isActive: true,
      isProfileCompleted: true,
      password: "test-password-hash",
    },
  });

  const mover = await prisma.user.create({
    data: {
      email: moverEmail,
      name: "취소경쟁기사",
      role: "MOVER",
      isActive: true,
      isProfileCompleted: true,
      password: "test-password-hash",
      moverProfile: {
        create: {
          nickname: moverNickname,
          shortIntro: "race test",
          description: "race integration test mover",
          approvalStatus: "APPROVED",
          serviceTypes: { create: [{ moveType: "HOME" }] },
          serviceAreas: { create: [{ regionId: region.id }] },
        },
      },
    },
  });

  const moveDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const request = await prisma.estimateRequest.create({
    data: {
      customerId: customer.id,
      moveType: "HOME",
      moveDate,
      fromZipCode: "06236",
      fromAddress: "서울특별시 강남구 테헤란로 1",
      fromRegionId: region.id,
      toZipCode: "21403",
      toAddress: "인천광역시 부평구 부일로 1",
      toRegionId: region.id,
      status: "OPEN",
      isActive: true,
      expiresAt,
    },
  });

  return {
    customerId: customer.id,
    moverId: mover.id,
    requestId: request.id,
    customerEmail,
    moverEmail,
    moverNickname,
  };
}

async function cleanupRaceFixture(fixture: RaceFixture): Promise<void> {
  await prisma.notification.deleteMany({
    where: { userId: { in: [fixture.customerId, fixture.moverId] } },
  });
  await prisma.estimate.deleteMany({ where: { estimateRequestId: fixture.requestId } });
  await prisma.estimateRequestHistory.deleteMany({
    where: { estimateRequestId: fixture.requestId },
  });
  await prisma.estimateRequestRejection.deleteMany({
    where: { estimateRequestId: fixture.requestId },
  });
  await prisma.designatedMover.deleteMany({ where: { estimateRequestId: fixture.requestId } });
  await prisma.estimateRequest.deleteMany({ where: { id: fixture.requestId } });
  await prisma.moverServiceType.deleteMany({
    where: { moverProfile: { userId: fixture.moverId } },
  });
  await prisma.moverServiceArea.deleteMany({
    where: { moverProfile: { userId: fixture.moverId } },
  });
  await prisma.moverProfile.deleteMany({ where: { userId: fixture.moverId } });
  await prisma.user.deleteMany({ where: { id: { in: [fixture.customerId, fixture.moverId] } } });
}

const runDbIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "1";

(runDbIntegration ? describe : describe.skip)("cancel ↔ sendEstimate race (PostgreSQL)", () => {
  it("cancel이 먼저 커밋되면 sendEstimate는 CONFLICT이고 SENT를 만들지 않는다", async () => {
    const fixture = await createRaceFixture();

    try {
      await estimateRequestService.cancelEstimateRequest(fixture.requestId, fixture.customerId);

      await assert.rejects(
        () =>
          moverEstimateRequestService.sendEstimate({
            estimateRequestId: fixture.requestId,
            moverId: fixture.moverId,
            input: { price: 150_000, comment: "race-cancel-first-comment-20chars" },
          }),
        (error: unknown) =>
          error instanceof AppError &&
          (error.code === "CONFLICT" || error.code === "ESTIMATE_REQUEST_NOT_FOUND"),
      );

      const estimateCount = await prisma.estimate.count({
        where: { estimateRequestId: fixture.requestId },
      });
      assert.equal(estimateCount, 0);

      const request = await prisma.estimateRequest.findUniqueOrThrow({
        where: { id: fixture.requestId },
      });
      assert.equal(request.status, "CANCELED");
      assert.equal(request.isActive, false);
    } finally {
      await cleanupRaceFixture(fixture);
    }
  });

  it("sendEstimate가 먼저 커밋되면 cancel이 SENT 견적을 CANCELED로 바꾼다", async () => {
    const fixture = await createRaceFixture();

    try {
      await moverEstimateRequestService.sendEstimate({
        estimateRequestId: fixture.requestId,
        moverId: fixture.moverId,
        input: { price: 180_000, comment: "race-send-first-comment-20chars!" },
      });

      await estimateRequestService.cancelEstimateRequest(fixture.requestId, fixture.customerId);

      const request = await prisma.estimateRequest.findUniqueOrThrow({
        where: { id: fixture.requestId },
      });
      assert.equal(request.status, "CANCELED");
      assert.equal(request.isActive, false);
      assert.ok(request.canceledAt);

      const estimates = await prisma.estimate.findMany({
        where: { estimateRequestId: fixture.requestId },
      });
      assert.equal(estimates.length, 1);
      assert.equal(estimates[0]?.status, "CANCELED");
      assert.ok(estimates[0]?.canceledAt);
    } finally {
      await cleanupRaceFixture(fixture);
    }
  });

  it("FOR UPDATE: cancel이 잠금 보유 중이면 send 잠금은 대기 후 CANCELED를 본다", async () => {
    const fixture = await createRaceFixture();
    const cancelLocked = createDeferred();
    const releaseCancel = createDeferred();
    let statusSeenBySend: string | null = null;

    try {
      const cancelTx = prisma.$transaction(async (tx) => {
        const locked = await lockEstimateRequestForUpdate(tx, fixture.requestId);
        assert.equal(locked, true);
        cancelLocked.resolve();
        await releaseCancel.promise;

        await tx.estimateRequest.updateMany({
          where: {
            id: fixture.requestId,
            isActive: true,
            status: { in: ["PENDING", "OPEN"] },
          },
          data: {
            status: "CANCELED",
            isActive: false,
            canceledAt: new Date(),
          },
        });
      });

      await cancelLocked.promise;

      const sendTx = prisma.$transaction(async (tx) => {
        await lockEstimateRequestForUpdate(tx, fixture.requestId);
        const request = await tx.estimateRequest.findUnique({
          where: { id: fixture.requestId },
          select: { status: true },
        });
        statusSeenBySend = request?.status ?? null;
      });

      // send 쪽이 FOR UPDATE 대기 상태에 들어가도록 잠시 양보
      await new Promise((resolve) => setTimeout(resolve, 150));
      releaseCancel.resolve();
      await Promise.all([cancelTx, sendTx]);

      assert.equal(statusSeenBySend, "CANCELED");
    } finally {
      releaseCancel.resolve();
      await cleanupRaceFixture(fixture);
    }
  });
});
