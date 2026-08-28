import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { FindManyMoversParams } from "./mover.type";
import {
  buildActiveMoverUserWhere,
  buildMoverListOrderBy,
  buildMoverListWhere,
  MOVER_DETAIL_SELECT,
  MOVER_LIST_SELECT,
} from "./mover.query";

type Db = PrismaClient | Prisma.TransactionClient;

export const moverRepository = {
  async findMany(params: FindManyMoversParams) {
    const where = buildMoverListWhere(params);

    const [movers, totalCount] = await Promise.all([
      prisma.moverProfile.findMany({
        where,
        select: MOVER_LIST_SELECT,
        orderBy: buildMoverListOrderBy(params.sort),
        skip: params.skip,
        take: params.take,
      }),
      prisma.moverProfile.count({ where }),
    ]);

    return {
      movers,
      totalCount,
    };
  },

  findByMoverUserId(moverUserId: string) {
    return prisma.moverProfile.findFirst({
      where: {
        userId: moverUserId,
        user: buildActiveMoverUserWhere(),
      },
      select: MOVER_DETAIL_SELECT,
    });
  },

  countRatingDistributionByMoverId(moverId: string, db: Db = prisma) {
    return db.review.groupBy({
      by: ["rating"],
      where: {
        moverId,
        isHidden: false,
      },
      _count: {
        _all: true,
      },
    });
  },
};
