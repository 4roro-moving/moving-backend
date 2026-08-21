import type { Prisma } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

/** 회원 상세 화면에서 제공하는 정지·해제 이력의 기본 최신 건수입니다. */
const MEMBER_SUSPENSION_HISTORY_LIMIT = 5;

const suspensionHistorySelect = {
  id: true,
  action: true,
  reason: true,
  internalNote: true,
  createdAt: true,
  admin: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.UserSuspensionSelect;

export const memberRepository = {
  /** 회원 계정의 정지·해제 이력 최신 일부와 전체 건수를 조회합니다. */
  async findSuspensionHistory(
    { memberId, take = MEMBER_SUSPENSION_HISTORY_LIMIT }: { memberId: string; take?: number },
    db: DbClient = prisma,
  ) {
    const where: Prisma.UserSuspensionWhereInput = { userId: memberId };

    const [items, totalCount] = await Promise.all([
      db.userSuspension.findMany({
        where,
        select: suspensionHistorySelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take,
      }),
      db.userSuspension.count({ where }),
    ]);

    return { items, totalCount };
  },
};
