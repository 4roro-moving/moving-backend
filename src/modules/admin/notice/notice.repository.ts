import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

/**
 * 공지 조회에 공통으로 사용하는 select.
 */
const noticeSelect = {
  id: true,
  title: true,
  content: true,
  audience: true,
  isPinned: true,
  isVisible: true,
  sendNotification: true,
  viewCount: true,
  authorId: true,
  author: {
    select: { id: true, name: true },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NoticeSelect;

type ListParams = {
  skip: number;
  take: number;
  where: Prisma.NoticeWhereInput;
};

export const noticeRepository = {
  create(data: Prisma.NoticeUncheckedCreateInput, db: DbClient = prisma) {
    return db.notice.create({
      data,
      select: noticeSelect,
    });
  },

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

  update(noticeId: number, data: Prisma.NoticeUncheckedUpdateInput, db: DbClient = prisma) {
    return db.notice.update({
      where: { id: noticeId },
      data,
      select: noticeSelect,
    });
  },

  delete(noticeId: number, db: DbClient = prisma) {
    return db.notice.delete({
      where: { id: noticeId },
    });
  },
};
