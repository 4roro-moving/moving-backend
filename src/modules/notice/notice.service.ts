import type { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";
import { escapeLikePattern } from "../../utils/search.util";

import { noticeRepository } from "./notice.repository";
import type { ListNoticeQuery, NoticeUserRole } from "./notice.type";

function buildNoticeWhere(
  role: NoticeUserRole | undefined,
  keyword?: string,
  category?: "SERVICE" | "MAINTENANCE" | "EVENT",
): Prisma.NoticeWhereInput {
  const where: Prisma.NoticeWhereInput = {
    isVisible: true,
    audience: role
      ? {
          in: ["ALL", role],
        }
      : "ALL",
  };

  if (keyword !== undefined) {
    where.title = {
      contains: escapeLikePattern(keyword),
      mode: "insensitive",
    };
  }

  if (category !== undefined) {
    where.category = category;
  }

  return where;
}

function canReadNotice(
  audience: "ALL" | NoticeUserRole,
  role: NoticeUserRole | undefined,
): boolean {
  return audience === "ALL" || audience === role;
}

export const noticeService = {
  async getNoticeList(role: NoticeUserRole | undefined, query: ListNoticeQuery) {
    const { page, limit, keyword, category } = query;

    const { notices, totalCount } = await noticeRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where: buildNoticeWhere(role, keyword, category),
    });

    return {
      notices,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  async getNoticeById(role: NoticeUserRole | undefined, noticeId: number) {
    const notice = await noticeRepository.findById(noticeId);

    if (!notice || !notice.isVisible || !canReadNotice(notice.audience, role)) {
      throw new AppError("NOTICE_NOT_FOUND");
    }

    return noticeRepository.incrementViewCount(noticeId);
  },
};
