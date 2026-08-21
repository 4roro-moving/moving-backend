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

/**
 * 견적 상태 변경과 채팅 메시지 저장을 직렬화하기 위해 견적 행을 배타 잠금한다.
 *
 * 기사 정지 시 개별 Estimate의 상태를 CANCELED로 변경하므로,
 * 견적 요청 잠금만으로는 종료된 견적 채팅방에 메시지가 저장되는 race condition을 막기 어려움
 */
export async function lockEstimateForUpdate(
  db: Prisma.TransactionClient,
  estimateId: number,
): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`SELECT id FROM estimates WHERE id = ${estimateId} FOR UPDATE`,
  );

  return rows.length > 0;
}
