import type { Prisma } from "@prisma/client";
import type { DbClient } from "../../../../utils/transaction";
import { prisma } from "../../../../lib/prisma";

/** 기사 목록 DTO 변환에 필요한 User 및 MoverProfile 조회 필드입니다. */
const moverListSelect = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  isProfileCompleted: true,
  deletedAt: true,
  createdAt: true,
  moverProfile: {
    select: {
      nickname: true,
      career: true,
      averageRating: true,
      reviewCount: true,
      confirmedCount: true,
      serviceAreas: {
        select: { region: { select: { name: true } } },
        orderBy: { regionId: "asc" },
      },
      serviceTypes: {
        select: { moveType: true },
        orderBy: { id: "asc" },
      },
    },
  },
} satisfies Prisma.UserSelect;

export type MoverListRow = Prisma.UserGetPayload<{ select: typeof moverListSelect }>;

type ListParams = {
  skip: number;
  take: number;
  where: Prisma.UserWhereInput;
};

export const moversRepository = {
  /**
   * 목록과 전체 건수를 동일한 필터 조건으로 병렬 조회합니다.
   */
  async findManyWithCount({ skip, take, where }: ListParams, db: DbClient = prisma) {
    const [movers, totalCount] = await Promise.all([
      db.user.findMany({
        where,
        select: moverListSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      db.user.count({ where }),
    ]);

    return { movers, totalCount };
  },
};
