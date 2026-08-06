import type { Prisma } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { buildPagination } from "../../../utils/pagination.util";

import { runTransaction } from "../../../utils/transaction";
import { notificationService } from "../../notification/notification.service";
import { noticeRepository } from "./notice.repository";
import type { CreateNoticeInput, ListNoticeQuery, UpdateNoticeInput } from "./notice.type";

type CreateParams = {
  authorId: string;
  input: CreateNoticeInput;
};

type UpdateParams = {
  noticeId: number;
  input: UpdateNoticeInput;
};

export const noticeService = {
  /**
   * 공지를 생성합니다.
   * sendNotification 이 true 이면 audience 대상 사용자에게 알림을 함께 발송합니다.
   * 공지 저장과 알림 발송은 하나의 트랜잭션으로 처리합니다.
   *
   * NOTE: 공지 알림을 사용하려면 Prisma enum NotificationType 에
   *       NOTICE_RECEIVED 값을 추가하는 마이그레이션이 필요합니다.
   *       (알림이 필요 없다면 sendNotification 을 false 로 두면 됩니다.)
   */
  async createNotice({ authorId, input }: CreateParams) {
    const { sendNotification, ...noticeData } = input;

    const notice = await runTransaction(async (tx) => {
      return noticeRepository.create({ ...noticeData, sendNotification, authorId }, tx);
    });

    // 대량 알림은 자체 배치 + 멱등(sourceId) + refresh SSE 로 처리되므로 커밋 이후 호출한다.
    // 재실행되어도 대상 기준 시점이 흔들리지 않도록 snapshotAt 에 notice.createdAt 을 전달한다.
    if (sendNotification) {
      await notificationService.createBulkNotification({
        role: notice.audience,
        type: "NOTICE_RECEIVED",
        title: "새로운 공지사항",
        content: notice.title,
        linkUrl: `/notices/${String(notice.id)}`,
        snapshotAt: notice.createdAt,
        sourceId: `notice:${String(notice.id)}`,
        expiresAt: null,
      });
    }

    return notice;
  },

  /**
   * 공지 목록을 조회합니다. (관리자용: 숨김 공지도 조회 가능)
   * 고정 공지 우선, 그다음 최신순으로 정렬됩니다.
   */
  async getNoticeList(query: ListNoticeQuery) {
    const { page, limit, audience, isVisible } = query;

    const where: Prisma.NoticeWhereInput = {};

    if (audience !== undefined) {
      where.audience = audience;
    }

    if (isVisible !== undefined) {
      where.isVisible = isVisible;
    }

    const { notices, totalCount } = await noticeRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where,
    });

    return {
      notices,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /**
   * 공지 상세를 조회합니다.
   */
  async getNoticeById(noticeId: number) {
    const notice = await noticeRepository.findById(noticeId);

    if (!notice) {
      throw new AppError("NOTICE_NOT_FOUND");
    }

    return notice;
  },

  /**
   * 공지를 수정합니다.
   */
  async updateNotice({ noticeId, input }: UpdateParams) {
    await noticeService.getNoticeById(noticeId);

    const data: Prisma.NoticeUncheckedUpdateInput = {};

    if (input.title !== undefined) {
      data.title = input.title;
    }

    if (input.content !== undefined) {
      data.content = input.content;
    }

    if (input.audience !== undefined) {
      data.audience = input.audience;
    }

    if (input.isPinned !== undefined) {
      data.isPinned = input.isPinned;
    }

    if (input.isVisible !== undefined) {
      data.isVisible = input.isVisible;
    }

    return noticeRepository.update(noticeId, data);
  },

  /**
   * 공지를 삭제합니다.
   */
  async deleteNotice(noticeId: number) {
    await noticeService.getNoticeById(noticeId);

    await noticeRepository.delete(noticeId);
  },
};
