import { LogAction, type NotificationType } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { notificationService } from "../../notification/notification.service";
import { buildPagination } from "../../../utils/pagination.util";
import { runTransaction } from "../../../utils/transaction";

import {
  contentsRepository,
  type AdminReviewListFilters,
  type AdminReviewRow,
} from "./contents.repository";
import type {
  AdminReviewListItem,
  HideContentBody,
  LatestModeration,
  ListAdminReviewsQuery,
  UnhideContentBody,
} from "./contents.type";

function toStartOfDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function toEndOfDay(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

function buildReviewListFilters(query: ListAdminReviewsQuery): AdminReviewListFilters {
  const filters: AdminReviewListFilters = {};

  if (query.isHidden !== undefined) {
    filters.isHidden = query.isHidden;
  }
  if (query.keyword !== undefined) {
    filters.keyword = query.keyword;
  }
  if (query.from) {
    filters.from = toStartOfDay(query.from);
  }
  if (query.to) {
    filters.to = toEndOfDay(query.to);
  }

  return filters;
}

function pickLatestModerationByTargetId(
  logs: Awaited<ReturnType<typeof contentsRepository.findModerationLogsByTargetIds>>,
): Map<string, LatestModeration> {
  const map = new Map<string, LatestModeration>();

  for (const log of logs) {
    if (map.has(log.targetId)) {
      continue;
    }

    if (log.action !== LogAction.HIDE && log.action !== LogAction.UNHIDE) {
      continue;
    }

    map.set(log.targetId, {
      action: log.action,
      reason: log.memo,
      adminName: log.actor.name,
      createdAt: log.createdAt,
    });
  }

  return map;
}

function toAdminReviewListItem(
  review: AdminReviewRow,
  reportCount: number,
  latestModeration: LatestModeration | null,
): AdminReviewListItem {
  return {
    id: review.id,
    contentType: "REVIEW",
    isHidden: review.isHidden,
    rating: review.rating,
    content: review.content,
    author: {
      id: review.customer.id,
      name: review.customer.name,
      email: review.customer.email,
    },
    mover: {
      id: review.mover.id,
      name: review.mover.moverProfile?.nickname ?? review.mover.name,
    },
    estimateId: review.estimateId,
    reportCount,
    latestModeration,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

function getMoverNotificationSubject(review: AdminReviewRow): string {
  const moverName = review.mover.moverProfile?.nickname ?? review.mover.name;
  return `${moverName} 기사님에 대한 리뷰`;
}

async function attachListMeta(reviews: AdminReviewRow[]): Promise<AdminReviewListItem[]> {
  const targetIds = reviews.map((review) => String(review.id));

  const [reportGroups, moderationLogs] = await Promise.all([
    contentsRepository.countReportsByTargetIds(targetIds),
    contentsRepository.findModerationLogsByTargetIds(targetIds),
  ]);

  const reportCountMap = new Map(
    reportGroups.map((group) => [group.targetId, group._count._all] as const),
  );
  const latestMap = pickLatestModerationByTargetId(moderationLogs);

  return reviews.map((review) =>
    toAdminReviewListItem(
      review,
      reportCountMap.get(String(review.id)) ?? 0,
      latestMap.get(String(review.id)) ?? null,
    ),
  );
}

type VisibilityToggleAction = "HIDE" | "UNHIDE";

const VISIBILITY_TOGGLE_CONFIG: Record<
  VisibilityToggleAction,
  {
    expectedHidden: boolean;
    nextHidden: boolean;
    conflictError: "CONTENT_ALREADY_HIDDEN" | "CONTENT_NOT_HIDDEN";
    logAction: typeof LogAction.HIDE | typeof LogAction.UNHIDE;
    notificationType: NotificationType;
    notificationTitle: string;
  }
> = {
  HIDE: {
    expectedHidden: false,
    nextHidden: true,
    conflictError: "CONTENT_ALREADY_HIDDEN",
    logAction: LogAction.HIDE,
    notificationType: "CONTENT_HIDDEN",
    notificationTitle: "리뷰가 숨김 처리되었습니다",
  },
  UNHIDE: {
    expectedHidden: true,
    nextHidden: false,
    conflictError: "CONTENT_NOT_HIDDEN",
    logAction: LogAction.UNHIDE,
    notificationType: "CONTENT_RESTORED",
    notificationTitle: "리뷰 숨김이 해제되었습니다",
  },
};

async function toggleReviewVisibility(params: {
  adminId: string;
  reviewId: number;
  action: VisibilityToggleAction;
  reason: string | null;
}): Promise<AdminReviewListItem> {
  const { adminId, reviewId, action, reason } = params;
  const config = VISIBILITY_TOGGLE_CONFIG[action];

  const result = await runTransaction(async (tx) => {
    const review = await contentsRepository.findReviewById(reviewId, tx);

    if (!review) {
      throw new AppError("CONTENT_NOT_FOUND");
    }

    const updated = await contentsRepository.updateReviewHiddenIf(
      reviewId,
      config.expectedHidden,
      config.nextHidden,
      tx,
    );

    if (!updated) {
      throw new AppError(config.conflictError);
    }

    await contentsRepository.createActivityLog(
      {
        actorId: adminId,
        action: config.logAction,
        targetId: String(reviewId),
        memo: reason,
      },
      tx,
    );

    const notification = await notificationService.createNotification(
      {
        userId: review.customerId,
        type: config.notificationType,
        title: config.notificationTitle,
        content: getMoverNotificationSubject(review),
        linkUrl: `/my-contents/review/${String(reviewId)}`,
        expiresAt: null,
      },
      tx,
    );

    return { updated, notification, authorId: review.customerId };
  });

  notificationService.sendNotification(result.authorId, result.notification);

  const items = await attachListMeta([result.updated]);
  const item = items[0];
  if (!item) {
    throw new AppError("CONTENT_NOT_FOUND");
  }
  return item;
}

export const contentsService = {
  async getReviewList(query: ListAdminReviewsQuery) {
    const { page, limit, sort } = query;

    const { reviews, totalCount } = await contentsRepository.findReviewsWithCount({
      skip: (page - 1) * limit,
      take: limit,
      filters: buildReviewListFilters(query),
      sort,
      reportedOnly: query.reportedOnly === true,
    });

    const items = await attachListMeta(reviews);

    return {
      items,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  async hideReview(params: { adminId: string; reviewId: number; input: HideContentBody }) {
    return toggleReviewVisibility({
      adminId: params.adminId,
      reviewId: params.reviewId,
      action: "HIDE",
      reason: params.input.reason,
    });
  },

  async unhideReview(params: { adminId: string; reviewId: number; input: UnhideContentBody }) {
    return toggleReviewVisibility({
      adminId: params.adminId,
      reviewId: params.reviewId,
      action: "UNHIDE",
      reason: params.input.reason ?? null,
    });
  },
};
