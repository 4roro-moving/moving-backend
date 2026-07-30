import type { InquiryCategory, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

/** 목록 조회용 select (메시지 본문 제외, 요약 정보만) */
const inquiryListSelect = {
  id: true,
  category: true,
  title: true,
  status: true,
  handledBy: true,
  closedAt: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InquirySelect;

/** 상세 조회용 select (메시지 스레드 포함) */
const inquiryDetailSelect = {
  id: true,
  authorId: true,
  category: true,
  title: true,
  status: true,
  handledBy: true,
  closedAt: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: { id: true, name: true },
  },
  handler: {
    select: { id: true, name: true },
  },
  messages: {
    select: {
      id: true,
      senderId: true,
      content: true,
      isAdmin: true,
      isRead: true,
      createdAt: true,
      sender: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.InquirySelect;

type ListParams = {
  skip: number;
  take: number;
  where: Prisma.InquiryWhereInput;
};

export const inquiryRepository = {
  /** 문의 소유권/존재 확인용 최소 조회 */
  findOwnership(inquiryId: number, db: DbClient = prisma) {
    return db.inquiry.findUnique({
      where: { id: inquiryId },
      select: { id: true, authorId: true, status: true, handledBy: true },
    });
  },

  findById(inquiryId: number, db: DbClient = prisma) {
    return db.inquiry.findUnique({
      where: { id: inquiryId },
      select: inquiryDetailSelect,
    });
  },

  /** 문의 + 첫 메시지 생성 (호출 측에서 트랜잭션으로 감싼다) */
  async createWithFirstMessage(
    params: {
      authorId: string;
      category: InquiryCategory;
      title: string;
      content: string;
      now: Date;
    },
    db: DbClient = prisma,
  ) {
    const inquiry = await db.inquiry.create({
      data: {
        authorId: params.authorId,
        category: params.category,
        title: params.title,
        status: "OPEN",
        lastMessageAt: params.now,
      },
      select: { id: true },
    });

    await db.inquiryMessage.create({
      data: {
        inquiryId: inquiry.id,
        senderId: params.authorId,
        content: params.content,
        isAdmin: false,
      },
    });

    return inquiry.id;
  },

  /** 메시지 추가 + 문의 상태/lastMessageAt 갱신 (트랜잭션으로 감싼다) */
  async addMessage(
    params: {
      inquiryId: number;
      senderId: string;
      content: string;
      isAdmin: boolean;
      nextStatus: "OPEN" | "ANSWERED";
      handledBy?: string;
      now: Date;
    },
    db: DbClient = prisma,
  ) {
    await db.inquiryMessage.create({
      data: {
        inquiryId: params.inquiryId,
        senderId: params.senderId,
        content: params.content,
        isAdmin: params.isAdmin,
      },
    });

    const data: Prisma.InquiryUncheckedUpdateInput = {
      status: params.nextStatus,
      lastMessageAt: params.now,
    };

    if (params.handledBy !== undefined) {
      data.handledBy = params.handledBy;
    }

    await db.inquiry.update({
      where: { id: params.inquiryId },
      data,
    });
  },

  /** 문의 종료 */
  close(inquiryId: number, now: Date, db: DbClient = prisma) {
    return db.inquiry.update({
      where: { id: inquiryId },
      data: { status: "CLOSED", closedAt: now },
      select: inquiryListSelect,
    });
  },

  async findManyWithCount({ skip, take, where }: ListParams, db: DbClient = prisma) {
    const [inquiries, totalCount] = await Promise.all([
      db.inquiry.findMany({
        where,
        select: inquiryListSelect,
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      db.inquiry.count({ where }),
    ]);

    return { inquiries, totalCount };
  },

  /** 상대방이 보낸 안 읽은 메시지를 읽음 처리 */
  markMessagesRead(params: { inquiryId: number; readerIsAdmin: boolean }, db: DbClient = prisma) {
    return db.inquiryMessage.updateMany({
      where: {
        inquiryId: params.inquiryId,
        // 읽는 사람이 관리자면 사용자(isAdmin=false) 메시지를, 사용자면 관리자(isAdmin=true) 메시지를 읽음 처리
        isAdmin: !params.readerIsAdmin,
        isRead: false,
      },
      data: { isRead: true },
    });
  },
};
