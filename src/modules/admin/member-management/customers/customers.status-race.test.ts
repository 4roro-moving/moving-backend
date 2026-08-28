import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { SuspensionAction, UserRole } from "@prisma/client";

import "dotenv/config";

import { AppError } from "../../../../lib/app-error";
import { prisma } from "../../../../lib/prisma";
import { customersService } from "./customers.service";

/** 고객 상태 변경 동시성 검증에 사용하는 관리자·고객 테스트 데이터입니다. */
type Fixture = {
  adminId: string;
  customerId: string;
};

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const [admin, customer] = await Promise.all([
    prisma.user.create({
      data: {
        email: `customer-status-race-admin-${suffix}@test.local`,
        name: "상태경쟁관리자",
        password: "test-password-hash",
        role: UserRole.ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        email: `customer-status-race-customer-${suffix}@test.local`,
        name: "상태경쟁고객",
        password: "test-password-hash",
        role: UserRole.CUSTOMER,
      },
    }),
  ]);

  return { adminId: admin.id, customerId: customer.id };
}

async function cleanupFixture({ adminId, customerId }: Fixture): Promise<void> {
  // User 삭제 전, 해당 사용자를 참조하는 이력과 토큰을 먼저 정리
  await prisma.userSuspension.deleteMany({ where: { userId: customerId } });
  await prisma.activityLog.deleteMany({ where: { actorId: adminId, targetId: customerId } });
  await prisma.refreshToken.deleteMany({ where: { userId: customerId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, customerId] } } });
}

// 기본 npm test에서는 DB 의존 테스트를 건너뛰고, npm run test:db에서만 실행
const runDbIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "1";

(runDbIntegration ? describe : describe.skip)("고객 상태 변경 경쟁 상황 (PostgreSQL)", () => {
  it("동시 정지 요청 중 하나만 성공하고 이력도 한 번만 저장한다", async () => {
    const fixture = await createFixture();

    try {
      const input = { action: SuspensionAction.SUSPEND, reason: "동시성 테스트" };

      const results = await Promise.allSettled([
        customersService.updateCustomerStatus({ ...fixture, input }),
        customersService.updateCustomerStatus({ ...fixture, input }),
      ]);

      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.filter((result) => result.status === "rejected").length, 1);

      const rejected = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      assert.ok(rejected?.reason instanceof AppError);
      assert.equal(rejected.reason.code, "CUSTOMER_STATUS_ALREADY_PROCESSED");

      // 정지 이력과 관리자 활동 로그가 중복 저장되지 않는지 확인
      const [customer, suspensionCount, activityLogCount] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: fixture.customerId },
          select: { isActive: true },
        }),
        prisma.userSuspension.count({ where: { userId: fixture.customerId } }),
        prisma.activityLog.count({
          where: { actorId: fixture.adminId, targetId: fixture.customerId },
        }),
      ]);

      assert.equal(customer.isActive, false);
      assert.equal(suspensionCount, 1);
      assert.equal(activityLogCount, 1);
    } finally {
      await cleanupFixture(fixture);
    }
  });
});
