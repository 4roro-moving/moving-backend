import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../../../lib/prisma";

import type { UpdateFaqInput } from "./faq.type";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * FAQ 조회에 공통으로 사용하는 select.
 */
const faqSelect = {
  id: true,
  question: true,
  answer: true,
  sortOrder: true,
  isVisible: true,
  authorId: true,
  author: {
    select: { id: true, name: true },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FaqSelect;

type ListParams = {
  skip: number;
  take: number;
  where: Prisma.FaqWhereInput;
};

export const faqRepository = {
  create(data: Prisma.FaqUncheckedCreateInput, db: Db = prisma) {
    return db.faq.create({
      data,
      select: faqSelect,
    });
  },

  findById(faqId: number, db: Db = prisma) {
    return db.faq.findUnique({
      where: { id: faqId },
      select: faqSelect,
    });
  },

  /**
   * 관리자 목록 조회 (페이지네이션).
   * sortOrder 오름차순 우선, 동일하면 id 오름차순으로 정렬을 결정적으로 고정한다.
   */
  async findManyWithCount({ skip, take, where }: ListParams, db: Db = prisma) {
    const [faqs, totalCount] = await Promise.all([
      db.faq.findMany({
        where,
        select: faqSelect,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        skip,
        take,
      }),
      db.faq.count({ where }),
    ]);

    return { faqs, totalCount };
  },

  /**
   * 사용자 공개 목록 조회.
   * 공개(isVisible=true) FAQ만, sortOrder 순으로 정렬해 전부 반환한다.
   */
  findPublicList(db: Db = prisma) {
    return db.faq.findMany({
      where: { isVisible: true },
      select: faqSelect,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  },

  update(faqId: number, data: UpdateFaqInput, db: Db = prisma) {
    return db.faq.update({
      where: { id: faqId },
      data: data as Prisma.FaqUncheckedUpdateInput,
      select: faqSelect,
    });
  },

  delete(faqId: number, db: Db = prisma) {
    return db.faq.delete({
      where: { id: faqId },
    });
  },
};
