import { InquiryStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

/** 회원 상세 화면에서 제공하는 정지·해제 이력의 기본 최신 건수입니다. */
const MEMBER_SUSPENSION_HISTORY_LIMIT = 5;

/** 회원 상세 화면에서 제공하는 문의 이력의 기본 최신 건수입니다. */
const MEMBER_INQUIRY_HISTORY_LIMIT = 5;

const suspensionHistorySelect = {
  id: true,
  action: true,
  reason: true,
  internalNote: true,
  createdAt: true,
  admin: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.UserSuspensionSelect;

const inquiryHistorySelect = {
  id: true,
  category: true,
  title: true,
  status: true,
  lastMessageAt: true,
  createdAt: true,
  handler: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.InquirySelect;

export const memberRepository = {
  /** 회원 계정의 정지·해제 이력 최신 일부와 전체 건수를 조회합니다. */
  async findSuspensionHistory(
    { memberId, take = MEMBER_SUSPENSION_HISTORY_LIMIT }: { memberId: string; take?: number },
    db: DbClient = prisma,
  ) {
    const where: Prisma.UserSuspensionWhereInput = { userId: memberId };

    const [items, totalCount] = await Promise.all([
      db.userSuspension.findMany({
        where,
        select: suspensionHistorySelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take,
      }),
      db.userSuspension.count({ where }),
    ]);

    return { items, totalCount };
  },

  /**
   * 회원이 작성한 문의 이력을 미처리(OPEN) 우선으로 조회합니다.
   * OPEN 문의를 먼저 채운 뒤 나머지 자리를 ANSWERED·CLOSED 최신 문의로 채워,
   * 오래된 미처리 문의가 단순 최신 5건 밖으로 밀리지 않도록 합니다.
   */
  async findInquiryHistory(
    { memberId, take = MEMBER_INQUIRY_HISTORY_LIMIT }: { memberId: string; take?: number },
    db: DbClient = prisma,
  ) {
    const where: Prisma.InquiryWhereInput = { authorId: memberId };
    const openWhere: Prisma.InquiryWhereInput = { ...where, status: InquiryStatus.OPEN };

    const [openItems, totalCount, openCount] = await Promise.all([
      db.inquiry.findMany({
        where: openWhere,
        select: inquiryHistorySelect,
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        take,
      }),
      db.inquiry.count({ where }),
      db.inquiry.count({ where: openWhere }),
    ]);

    const remainingTake = take - openItems.length;
    const recentNonOpenItems =
      remainingTake > 0
        ? await db.inquiry.findMany({
            where: { ...where, status: { not: InquiryStatus.OPEN } },
            select: inquiryHistorySelect,
            orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
            take: remainingTake,
          })
        : [];

    return { items: [...openItems, ...recentNonOpenItems], totalCount, openCount };
  },
};
