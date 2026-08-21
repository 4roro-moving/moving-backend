import type { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";
import { escapeLikePattern } from "../../utils/search.util";

import { noticeRepository } from "./notice.repository";
import type { ListNoticeQuery, NoticeUserRole } from "./notice.type";

function buildNoticeWhere(role: NoticeUserRole, keyword?: string): Prisma.NoticeWhereInput {
  const where: Prisma.NoticeWhereInput = {
    isVisible: true,
    audience: {
      in: ["ALL", role],
    },
  };

  if (keyword !== undefined) {
    where.title = {
      contains: escapeLikePattern(keyword),
      mode: "insensitive",
    };
  }

  return where;
}

export const noticeService = {
  async getNoticeList(role: NoticeUserRole, query: ListNoticeQuery) {
    const { page, limit, keyword } = query;

    const { notices, totalCount } = await noticeRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where: buildNoticeWhere(role, keyword),
    });

    return {
      notices: notices.map(({ isVisible: _isVisible, ...notice }) => notice),
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  async getNoticeById(role: NoticeUserRole, noticeId: number) {
    const notice = await noticeRepository.findById(noticeId);

    if (!notice || !notice.isVisible || (notice.audience !== "ALL" && notice.audience !== role)) {
      throw new AppError("NOTICE_NOT_FOUND");
    }

    const { isVisible: _isVisible, ...publicNotice } = notice;

    return publicNotice;
  },
};
