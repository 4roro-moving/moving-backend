import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

const noticeSelect = {
  id: true,
  title: true,
  content: true,
  audience: true,
  isPinned: true,
  isVisible: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
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
      select: noticeSelect,
    });
  },

  async findManyWithCount({ skip, take, where }: ListParams, db: DbClient = prisma) {
    const [notices, totalCount] = await Promise.all([
      db.notice.findMany({
        where,
        select: noticeSelect,
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      db.notice.count({ where }),
    ]);

    return { notices, totalCount };
  },
};
