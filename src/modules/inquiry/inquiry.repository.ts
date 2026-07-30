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

  /**
   * 메시지 추가 + 문의 상태/lastMessageAt 갱신 (트랜잭션으로 감싼다)
   * 상태 전이(updateMany, status != CLOSED)를 먼저 시도해 이미 종료된 문의면 아무것도 하지 않는다.
   * @returns 전이 성공 여부. false 면 이미 종료된 문의(호출 측에서 409 처리).
   */
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
  ): Promise<boolean> {
    const data: Prisma.InquiryUncheckedUpdateInput = {
      status: params.nextStatus,
      lastMessageAt: params.now,
    };

    if (params.handledBy !== undefined) {
      data.handledBy = params.handledBy;
    }

    // 상태 전이와 "종료 여부 확인"을 하나의 원자적 쿼리로 묶는다.
    const { count } = await db.inquiry.updateMany({
      where: { id: params.inquiryId, status: { not: "CLOSED" } },
      data,
    });

    if (count === 0) {
      return false;
    }

    await db.inquiryMessage.create({
      data: {
        inquiryId: params.inquiryId,
        senderId: params.senderId,
        content: params.content,
        isAdmin: params.isAdmin,
      },
    });

    return true;
  },

  /**
   * 문의 종료. status != CLOSED 조건으로 원자적으로 전이한다.
   * @returns 종료 성공 여부. false 면 이미 종료된 문의(호출 측에서 409 처리).
   */
  async close(inquiryId: number, now: Date, db: DbClient = prisma): Promise<boolean> {
    const { count } = await db.inquiry.updateMany({
      where: { id: inquiryId, status: { not: "CLOSED" } },
      data: { status: "CLOSED", closedAt: now },
    });

    return count > 0;
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
        isAdmin: !params.readerIsAdmin,
        isRead: false,
      },
      data: { isRead: true },
    });
  },
};
