import type { PrismaClient } from "@prisma/client";

import { ESTIMATE_REQUESTS, type EstimateRequestSeedKey } from "./estimateRequests.js";
import { ESTIMATES } from "./estimates.js";

function addDays(baseDate: Date, days: number): Date {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);

  return date;
}

export async function seedEstimateData(
  prisma: PrismaClient,
  regionIdMap: Map<string, number>,
): Promise<void> {
  console.log("📦 견적 요청 및 견적 데이터를 생성합니다.");

  const customerEmails = ESTIMATE_REQUESTS.map((request) => request.customerEmail);

  const moverEmails = [...new Set(ESTIMATES.map((estimate) => estimate.moverEmail))];

  const [customers, movers] = await Promise.all([
    prisma.user.findMany({
      where: {
        email: {
          in: customerEmails,
        },
        role: "CUSTOMER",
      },
      select: {
        id: true,
        email: true,
      },
    }),

    prisma.user.findMany({
      where: {
        email: {
          in: moverEmails,
        },
        role: "MOVER",
      },
      select: {
        id: true,
        email: true,
      },
    }),
  ]);

  const customerIdMap = new Map(customers.map((customer) => [customer.email, customer.id]));

  const moverIdMap = new Map(movers.map((mover) => [mover.email, mover.id]));

  /*
   * 필요한 기존 고객과 기사님이 모두 생성되었는지 확인합니다.
   */
  for (const email of customerEmails) {
    if (!customerIdMap.has(email)) {
      throw new Error(`견적 요청에 연결할 고객이 없습니다: ${email}`);
    }
  }

  for (const email of moverEmails) {
    if (!moverIdMap.has(email)) {
      throw new Error(`견적에 연결할 기사님이 없습니다: ${email}`);
    }
  }

  /*
   * 지역 정보도 삭제 전에 미리 검증합니다.
   * 트랜잭션 내부에서 지역 누락으로 실패하는 상황을 줄입니다.
   */
  for (const requestData of ESTIMATE_REQUESTS) {
    if (!regionIdMap.has(requestData.fromRegion)) {
      throw new Error(`출발 지역을 찾을 수 없습니다: ${requestData.fromRegion}`);
    }

    if (!regionIdMap.has(requestData.toRegion)) {
      throw new Error(`도착 지역을 찾을 수 없습니다: ${requestData.toRegion}`);
    }
  }

  const now = new Date();

  /*
   * 기존 견적 요청 삭제부터 관련 데이터 재생성까지
   * 하나의 트랜잭션으로 처리합니다.
   *
   * 중간에 예외가 발생하면 모든 변경 사항이 롤백됩니다.
   */
  await prisma.$transaction(async (tx) => {
    /*
     * 견적 요청에는 별도의 시드 식별용 unique 필드가 없으므로,
     * 시드 전용 고객들의 기존 견적 요청을 삭제한 뒤 다시 생성합니다.
     *
     * Estimate, DesignatedMover 등 관련 데이터는
     * onDelete: Cascade 설정에 따라 함께 삭제됩니다.
     */
    await tx.estimateRequest.deleteMany({
      where: {
        customerId: {
          in: [...customerIdMap.values()],
        },
      },
    });

    const estimateRequestIdMap = new Map<EstimateRequestSeedKey, number>();

    /*
     * 견적 요청 생성
     */
    for (const requestData of ESTIMATE_REQUESTS) {
      const customerId = customerIdMap.get(requestData.customerEmail);

      const fromRegionId = regionIdMap.get(requestData.fromRegion);

      const toRegionId = regionIdMap.get(requestData.toRegion);

      if (!customerId) {
        throw new Error(`고객 ID를 찾을 수 없습니다: ${requestData.customerEmail}`);
      }

      if (fromRegionId === undefined) {
        throw new Error(`출발 지역을 찾을 수 없습니다: ${requestData.fromRegion}`);
      }

      if (toRegionId === undefined) {
        throw new Error(`도착 지역을 찾을 수 없습니다: ${requestData.toRegion}`);
      }

      const estimateRequest = await tx.estimateRequest.create({
        data: {
          customerId,

          moveType: requestData.moveType,
          moveDate: addDays(now, requestData.moveDateOffsetDays),

          fromZipCode: requestData.fromZipCode,
          fromAddress: requestData.fromAddress,
          fromDetailAddress: requestData.fromDetailAddress,
          fromRegionId,

          toZipCode: requestData.toZipCode,
          toAddress: requestData.toAddress,
          toDetailAddress: requestData.toDetailAddress,
          toRegionId,

          status: requestData.status,
          isActive: requestData.isActive,
          expiresAt: addDays(now, requestData.expiresInDays),
        },
      });

      estimateRequestIdMap.set(requestData.key, estimateRequest.id);

      console.log(`  ✅ 견적 요청 생성: ${requestData.customerEmail} / ${requestData.key}`);
    }

    /*
     * 기사님 견적 생성
     */
    for (const estimateData of ESTIMATES) {
      const estimateRequestId = estimateRequestIdMap.get(estimateData.requestKey);

      const moverId = moverIdMap.get(estimateData.moverEmail);

      if (estimateRequestId === undefined) {
        throw new Error(`견적 요청을 찾을 수 없습니다: ${estimateData.requestKey}`);
      }

      if (!moverId) {
        throw new Error(`기사님을 찾을 수 없습니다: ${estimateData.moverEmail}`);
      }

      /*
       * 지정 견적이면 DesignatedMover 관계도 함께 생성합니다.
       */
      if (estimateData.isDesignated) {
        await tx.designatedMover.create({
          data: {
            estimateRequestId,
            moverId,
          },
        });
      }

      const estimate = await tx.estimate.create({
        data: {
          estimateRequestId,
          moverId,
          price: estimateData.price,
          comment: estimateData.comment,
          status: estimateData.status,
          isDesignated: estimateData.isDesignated,

          confirmedAt: estimateData.status === "CONFIRMED" ? now : null,
        },
      });

      /*
       * 확정 견적은 Estimate 상태뿐 아니라
       * EstimateRequest.confirmedEstimateId도 연결합니다.
       */
      if (estimateData.status === "CONFIRMED") {
        await tx.estimateRequest.update({
          where: {
            id: estimateRequestId,
          },
          data: {
            status: "CONFIRMED",
            isActive: false,
            confirmedEstimateId: estimate.id,
          },
        });
      }

      console.log(`  ✅ 견적 생성: ${estimateData.moverEmail} → ${estimateData.requestKey}`);
    }
  });

  console.log(`📦 견적 요청 ${ESTIMATE_REQUESTS.length}개, 견적 ${ESTIMATES.length}개 생성 완료`);
}
