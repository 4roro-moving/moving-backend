import type { Prisma } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import type { DbClient } from "../../../../utils/transaction";

/**
 * 고객 목록 조회에 공통으로 사용하는 select.
 * password, providerUserId 등 민감 정보는 포함하지 않습니다.
 */
const customerListSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  isActive: true,
  isProfileCompleted: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type CustomerListRow = Prisma.UserGetPayload<{ select: typeof customerListSelect }>;

type ListParams = {
  skip: number;
  take: number;
  where: Prisma.UserWhereInput;
};

export const customersRepository = {
  async findManyWithCount({ skip, take, where }: ListParams, db: DbClient = prisma) {
    const [customers, totalCount] = await Promise.all([
      db.user.findMany({
        where,
        select: customerListSelect,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      db.user.count({ where }),
    ]);

    return { customers, totalCount };
  },
};
