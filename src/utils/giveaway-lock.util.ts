import { Prisma } from "@prisma/client";

/**
 * 나눔 글 행을 트랜잭션 내에서 배타 잠금한다.
 * 동일 글의 이미지 수정이 교차할 때, update 직전 latestKeys와
 * S3 cleanup 대상이 어긋나지 않도록 read-modify-write를 직렬화한다.
 */
export async function lockGiveawayForUpdate(
  db: Prisma.TransactionClient,
  giveawayId: number,
): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`SELECT id FROM giveaways WHERE id = ${giveawayId} FOR UPDATE`,
  );

  return rows.length > 0;
}
