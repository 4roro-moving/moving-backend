import type { Prisma } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import { AppError } from "../../../lib/app-error";
import { buildPagination } from "../../../utils/pagination.util";

import { noticeRepository } from "./notice.repository";
import type { CreateNoticeInput, ListNoticeQuery, UpdateNoticeInput } from "./notice.type";

/**
 * 공지 알림 1건에 담기는 사용자별 데이터를 만듭니다.
 * NotificationType.NOTICE_RECEIVED 는 enum 추가 마이그레이션이 필요합니다.
 * (아래 create 주석 참고)
 */
function buildNoticeNotifications(
  recipientIds: string[],
  notice: { id: number; title: string },
): Prisma.NotificationCreateManyInput[] {
  return recipientIds.map((userId) => ({
    userId,
    type: "NOTICE_RECEIVED",
    title: "새로운 공지사항",
    content: notice.title,
    linkUrl: `/notices/${notice.id}`,
  }));
}

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

    return prisma.$transaction(async (tx) => {
      const notice = await noticeRepository.create(
        { ...noticeData, sendNotification, authorId },
        tx,
      );

      if (sendNotification) {
        const recipientIds = await noticeRepository.findRecipientIds(notice.audience, tx);

        if (recipientIds.length > 0) {
          await noticeRepository.createNotifications(
            buildNoticeNotifications(recipientIds, notice),
            tx,
          );
        }
      }

      return notice;
    });
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

    return noticeRepository.update(noticeId, input);
  },

  /**
   * 공지를 삭제합니다.
   */
  async deleteNotice(noticeId: number) {
    await noticeService.getNoticeById(noticeId);

    await noticeRepository.delete(noticeId);
  },
};
