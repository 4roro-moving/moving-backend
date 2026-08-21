import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

const noticeListSelect = {
  id: true,
  title: true,
  content: true,
  audience: true,
  isPinned: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NoticeSelect;

const noticeDetailSelect = {
  ...noticeListSelect,
  isVisible: true,
} satisfies Prisma.NoticeSelect;

type ListParams = {
  skip: number;
  take: number;
  where: Prisma.NoticeWhereInput;
};

export const noticeRepository = {
  findById(noticeId: number, db: DbClient = prisma) {
    return db.notice.findUnique({
      where: { id: noticeId },
      select: noticeDetailSelect,
    });
  },

  incrementViewCount(noticeId: number, db: DbClient = prisma) {
    return db.notice.update({
      where: { id: noticeId },
      data: {
        viewCount: {
          increment: 1,
        },
      },
      select: noticeListSelect,
    });
  },

  async findManyWithCount({ skip, take, where }: ListParams, db: DbClient = prisma) {
    const [notices, totalCount] = await Promise.all([
      db.notice.findMany({
        where,
        select: noticeListSelect,
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      db.notice.count({ where }),
    ]);

    return { notices, totalCount };
  },
};
