import type { PrismaClient } from "@prisma/client";

import { ESTIMATE_REQUESTS, type EstimateRequestSeedKey } from "./estimateRequests.js";
import { ESTIMATES } from "./estimates.js";
import type { ConfirmedEstimateSeedRef } from "./seedReviews.js";

function addDays(baseDate: Date, days: number): Date {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);

  return date;
}

/** 대량 createMany 시 파라미터 한도를 피하기 위한 청크 분할 */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

const CREATE_CHUNK_SIZE = 500;

/*
 * 리뷰 시드 연동을 위해 반환값을 추가했습니다.
 * - 확정 견적 ref를 seedReviews에 넘겨 Review.estimateId를 연결합니다.
 * - COMPLETED 요청은 확정 시 상태를 CONFIRMED로 덮어쓰지 않습니다.
 */
export async function seedEstimateData(
  prisma: PrismaClient,
  regionIdMap: Map<string, number>,
): Promise<ConfirmedEstimateSeedRef[]> {
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
  // seedReviews에서 Review 생성 시 사용할 확정 견적 목록
  const confirmedEstimates: ConfirmedEstimateSeedRef[] = [];

  // requestKey → 시드 요청 매핑 (CONFIRMED 처리 시 O(1) 조회용)
  const requestSeedByKey = new Map(ESTIMATE_REQUESTS.map((r) => [r.key, r] as const));

  /*
   * 기존 견적 요청 삭제부터 관련 데이터 재생성까지
   * 하나의 트랜잭션으로 처리합니다.
   *
   * 리뷰 시드 추가로 요청·견적 수가 늘어나
   * 기본 timeout(5s)에 걸릴 수 있어 여유를 둡니다.
   */
  await prisma.$transaction(
    async (tx) => {
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
       * 견적 요청 생성 (배치)
       * ---------------------------------------------------------------
       * 규모가 커져(수천 건) 단건 create 루프는 느리므로 createMany 로 일괄
       * 생성한다. createMany 는 생성된 id 를 돌려주지 않으므로, 각 요청의
       * fromDetailAddress(시드가 넣은 고유 값)로 재조회해 id 를 복원한다.
       * (scenarioSeeds 가 fromDetailAddress 에 요청 key 를 포함한 고유 문자열을 넣어둔다)
       */
      const requestCreateData = ESTIMATE_REQUESTS.map((requestData) => {
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

        return {
          key: requestData.key,
          data: {
            customerId,
            moveType: requestData.moveType,
            moveDate: addDays(now, requestData.moveDateOffsetDays),
            fromZipCode: requestData.fromZipCode,
            fromAddress: requestData.fromAddress,
            // 시드가 넣은 고유 상세주소를 그대로 사용(재조회 키)
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
        };
      });

      for (const part of chunk(
        requestCreateData.map((r) => r.data),
        CREATE_CHUNK_SIZE,
      )) {
        await tx.estimateRequest.createMany({ data: part });
      }

      // fromDetailAddress(고유) → 요청 key 역매핑
      const keyByDetailAddress = new Map(
        requestCreateData.map((r) => [r.data.fromDetailAddress, r.key] as const),
      );

      // 방금 만든 요청들을 재조회해 key → id 매핑 복원
      const createdRequests = await tx.estimateRequest.findMany({
        where: {
          customerId: { in: [...customerIdMap.values()] },
        },
        select: { id: true, fromDetailAddress: true },
      });

      for (const row of createdRequests) {
        const key = row.fromDetailAddress
          ? keyByDetailAddress.get(row.fromDetailAddress)
          : undefined;
        if (key) {
          estimateRequestIdMap.set(key, row.id);
        }
      }

      console.log(`  ✅ 견적 요청 ${requestCreateData.length}건 생성 완료 (배치)`);

      /*
       * 기사님 견적 생성 (배치)
       * ---------------------------------------------------------------
       * 규모가 수천 건이라 단건 create 루프는 트랜잭션 timeout(P2028)을
       * 유발한다. createMany 로 일괄 생성하고, 생성된 id 는
       * (estimateRequestId, moverId) 조합으로 재조회해 복원한다.
       * 이 조합은 Estimate @@unique 라 견적을 유일하게 식별한다.
       */
      const estimateCreateData = ESTIMATES.map((estimateData) => {
        const estimateRequestId = estimateRequestIdMap.get(estimateData.requestKey);
        const moverId = moverIdMap.get(estimateData.moverEmail);

        if (estimateRequestId === undefined) {
          throw new Error(`견적 요청을 찾을 수 없습니다: ${estimateData.requestKey}`);
        }
        if (!moverId) {
          throw new Error(`기사님을 찾을 수 없습니다: ${estimateData.moverEmail}`);
        }

        return {
          requestKey: estimateData.requestKey,
          estimateRequestId,
          moverId,
          status: estimateData.status,
          data: {
            estimateRequestId,
            moverId,
            price: estimateData.price,
            comment: estimateData.comment,
            status: estimateData.status,
            isDesignated: estimateData.isDesignated,
            confirmedAt: estimateData.status === "CONFIRMED" ? now : null,
          },
        };
      });

      // 1) 지정 견적의 DesignatedMover 일괄 생성
      const designatedData = estimateCreateData
        .filter((e) => e.data.isDesignated)
        .map((e) => ({ estimateRequestId: e.estimateRequestId, moverId: e.moverId }));

      if (designatedData.length > 0) {
        for (const part of chunk(designatedData, CREATE_CHUNK_SIZE)) {
          await tx.designatedMover.createMany({ data: part });
        }
      }

      // 2) 견적 일괄 생성
      for (const part of chunk(
        estimateCreateData.map((e) => e.data),
        CREATE_CHUNK_SIZE,
      )) {
        await tx.estimate.createMany({ data: part });
      }

      // 3) (estimateRequestId, moverId) → estimateId 복원
      const createdEstimates = await tx.estimate.findMany({
        where: {
          estimateRequestId: { in: [...estimateRequestIdMap.values()] },
        },
        select: { id: true, estimateRequestId: true, moverId: true },
      });

      const estimateIdByPair = new Map<string, number>();
      for (const row of createdEstimates) {
        estimateIdByPair.set(`${row.estimateRequestId}|${row.moverId}`, row.id);
      }

      // 4) CONFIRMED 견적: 수집 후 요청 update 를 병렬 청크로 처리
      const confirmedUpdates: {
        estimateRequestId: number;
        nextStatus: "COMPLETED" | "CONFIRMED";
        confirmedEstimateId: number;
      }[] = [];

      for (const e of estimateCreateData) {
        if (e.status !== "CONFIRMED") {
          continue;
        }

        const estimateId = estimateIdByPair.get(`${e.estimateRequestId}|${e.moverId}`);
        if (estimateId === undefined) {
          throw new Error(`생성된 견적 id 를 찾을 수 없습니다: ${e.requestKey} / ${e.moverId}`);
        }

        const requestSeed = requestSeedByKey.get(e.requestKey);
        if (!requestSeed) {
          throw new Error(`견적 요청 시드를 찾을 수 없습니다: ${e.requestKey}`);
        }

        const customerId = customerIdMap.get(requestSeed.customerEmail);
        if (!customerId) {
          throw new Error(`고객 ID를 찾을 수 없습니다: ${requestSeed.customerEmail}`);
        }

        const nextRequestStatus = requestSeed.status === "COMPLETED" ? "COMPLETED" : "CONFIRMED";

        confirmedUpdates.push({
          estimateRequestId: e.estimateRequestId,
          nextStatus: nextRequestStatus,
          confirmedEstimateId: estimateId,
        });

        confirmedEstimates.push({
          requestKey: e.requestKey,
          estimateId,
          customerId,
          moverId: e.moverId,
        });
      }

      // 행마다 confirmedEstimateId 가 달라 updateMany 불가 → 병렬 청크 update
      for (const part of chunk(confirmedUpdates, CREATE_CHUNK_SIZE)) {
        await Promise.all(
          part.map((u) =>
            tx.estimateRequest.update({
              where: { id: u.estimateRequestId },
              data: {
                status: u.nextStatus,
                isActive: false,
                confirmedEstimateId: u.confirmedEstimateId,
              },
            }),
          ),
        );
      }

      console.log(`  ✅ 견적 ${ESTIMATES.length}건 생성 완료 (배치)`);
    },
    {
      maxWait: 30_000,
      timeout: 300_000,
    },
  );

  console.log(`📦 견적 요청 ${ESTIMATE_REQUESTS.length}개, 견적 ${ESTIMATES.length}개 생성 완료`);

  // 리뷰 시드(seedReviews)에서 estimateId 연결용
  return confirmedEstimates;
}
