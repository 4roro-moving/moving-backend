import type { NoticeAudience, Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../../../lib/prisma";

import type { UpdateNoticeInput } from "./notice.type";

type Db = PrismaClient | Prisma.TransactionClient;

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
  create(data: Prisma.NoticeUncheckedCreateInput, db: Db = prisma) {
    return db.notice.create({
      data,
      select: noticeSelect,
    });
  },

  findById(noticeId: number, db: Db = prisma) {
    return db.notice.findUnique({
      where: { id: noticeId },
      select: noticeSelect,
    });
  },

  async findManyWithCount({ skip, take, where }: ListParams, db: Db = prisma) {
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

  update(noticeId: number, data: UpdateNoticeInput, db: Db = prisma) {
    return db.notice.update({
      where: { id: noticeId },
      data: data as Prisma.NoticeUncheckedUpdateInput,
      select: noticeSelect,
    });
  },

  delete(noticeId: number, db: Db = prisma) {
    return db.notice.delete({
      where: { id: noticeId },
    });
  },

  /**
   * 공지 알림 발송 대상 사용자 ID 를 조회합니다.
   * audience 가 ALL 이면 전체 활성 사용자, 그 외에는 해당 역할만 조회합니다.
   * (관리자 계정은 공지 알림 대상에서 제외합니다.)
   */
  async findRecipientIds(audience: NoticeAudience, db: Db = prisma): Promise<string[]> {
    const where: Prisma.UserWhereInput = {
      isActive: true,
      deletedAt: null,
    };

    if (audience === "CUSTOMER") {
      where.role = "CUSTOMER";
    } else if (audience === "MOVER") {
      where.role = "MOVER";
    } else {
      // ALL: 관리자를 제외한 일반 사용자 + 기사님
      where.role = { in: ["CUSTOMER", "MOVER"] };
    }

    const users = await db.user.findMany({
      where,
      select: { id: true },
    });

    return users.map((user) => user.id);
  },

  /**
   * 공지 알림을 일괄 생성합니다.
   * notification 모듈이 완성되면 해당 서비스로 교체합니다.
   */
  createNotifications(data: Prisma.NotificationCreateManyInput[], db: Db = prisma) {
    return db.notification.createMany({ data });
  },
};
