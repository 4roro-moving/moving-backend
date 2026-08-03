import { Prisma } from "@prisma/client";

/**
 * 견적 요청 행을 트랜잭션 내에서 배타 잠금한다.
 * 취소(cancel)와 견적 전송(sendEstimate)이 교차할 때
 * CANCELED 요청에 SENT 견적이 남는 경쟁을 막기 위해 사용한다.
 * // 2026.08.03 정슬기 - [추가]
 */
export async function lockEstimateRequestForUpdate(
  db: Prisma.TransactionClient,
  estimateRequestId: number,
): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`SELECT id FROM estimate_requests WHERE id = ${estimateRequestId} FOR UPDATE`,
  );

  return rows.length > 0;
}
