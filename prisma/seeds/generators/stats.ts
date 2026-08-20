/*
 * 적재 후 SQL 정리 작업
 * ============================================================================
 *
 *  Node 루프로 돌면 수만 번 왕복이 발생하는 것들을 SQL 한 문장으로 끝낸다.
 *
 *  기존 시드는 여기서 두 가지를 잘못하고 있었다.
 *    1) 확정 견적 연결을 행마다 개별 UPDATE (Promise.all 로 수만 번)
 *    2) 기사별 review.aggregate() 를 루프로 호출 (기사 수만큼 쿼리)
 *
 *  둘 다 단일 UPDATE ... FROM 으로 대체한다.
 * ============================================================================
 */

import type { PrismaClient } from "@prisma/client";

import { chunk } from "../lib/loader.js";

/**
 * EstimateRequest.confirmedEstimateId 를 채운다.
 *
 * 행마다 값이 달라 updateMany 가 불가능하지만, VALUES 목록을 조인하면
 * 한 문장으로 처리할 수 있다. 5,000건씩 나눠 보낸다.
 */
export async function linkConfirmedEstimates(
  prisma: PrismaClient,
  links: { requestId: number; estimateId: number }[],
): Promise<void> {
  console.log("🔗 확정 견적을 요청에 연결합니다");

  let done = 0;

  for (const part of chunk(links, 5_000)) {
    const values = part.map((l) => `(${l.requestId}, ${l.estimateId})`).join(",");

    await prisma.$executeRawUnsafe(`
      UPDATE "estimate_requests" er
      SET "confirmedEstimateId" = v.estimate_id
      FROM (VALUES ${values}) AS v(request_id, estimate_id)
      WHERE er.id = v.request_id
    `);

    done += part.length;
  }

  console.log(`  ✅ ${done.toLocaleString("ko-KR")}건`);
}

/**
 * MoverProfile 의 비정규화 캐시를 실제 집계와 맞춘다.
 *
 * averageRating 반올림 규칙은 review.service.ts 와 반드시 동일해야 한다.
 *   Math.round(avg * 10) / 10  ==  ROUND(avg::numeric, 1)
 *
 * confirmedCount 는 애플리케이션 코드가 증가시키지 않는 필드다(읽기 전용).
 * 정렬 옵션(sort=confirmedCount)으로 노출되므로 시드가 맞춰두지 않으면
 * 정렬 결과 자체가 거짓이 된다.
 */
export async function syncMoverStats(prisma: PrismaClient): Promise<void> {
  console.log("📈 기사 프로필 통계를 실제 집계와 맞춥니다");

  await prisma.$executeRawUnsafe(`
    UPDATE "mover_profiles" mp
    SET "reviewCount"   = COALESCE(s.cnt, 0),
        "averageRating" = COALESCE(ROUND(s.avg, 1), 0)
    FROM (
      SELECT mover_id, COUNT(*)::int AS cnt, AVG(rating)::numeric AS avg
      FROM "reviews"
      GROUP BY mover_id
    ) s
    WHERE mp."userId" = s.mover_id
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "mover_profiles" mp
    SET "confirmedCount" = COALESCE(s.cnt, 0)
    FROM (
      SELECT mover_id, COUNT(*)::int AS cnt
      FROM "estimates"
      WHERE status = 'CONFIRMED'
      GROUP BY mover_id
    ) s
    WHERE mp."userId" = s.mover_id
  `);

  console.log("  ✅ reviewCount / averageRating / confirmedCount");
}
