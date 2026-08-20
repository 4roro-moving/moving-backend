import { LogAction, type NotificationType } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { buildPagination } from "../../../utils/pagination.util";
import { runTransaction } from "../../../utils/transaction";
import { notificationService } from "../../notification/notification.service";

import {
  residenceReviewsRepository,
  type AdminResidenceReviewRow,
} from "./residence-reviews.repository";
import type {
  AdminResidenceReviewListItem,
  HideResidenceReviewBody,
  LatestModeration,
  ListAdminResidenceReviewsQuery,
} from "./residence-reviews.type";

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
    notificationTitle: "거주후기가 숨김 처리되었습니다",
  },
  UNHIDE: {
    expectedHidden: true,
    nextHidden: false,
    conflictError: "CONTENT_NOT_HIDDEN",
    logAction: LogAction.UNHIDE,
    notificationType: "CONTENT_RESTORED",
    notificationTitle: "거주후기 숨김이 해제되었습니다",
  },
};

function buildListFilters(query: ListAdminResidenceReviewsQuery) {
  const filters: { isHidden?: boolean; keyword?: string } = {};

  if (query.isHidden !== undefined) {
    filters.isHidden = query.isHidden;
  }
  if (query.keyword !== undefined) {
    filters.keyword = query.keyword;
  }

  return filters;
}

function pickLatestModerationByTargetId(
  logs: Awaited<ReturnType<typeof residenceReviewsRepository.findModerationLogsByTargetIds>>,
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

/** DB row + 신고수/검수기록 → 관리자 list item DTO */
function toAdminResidenceReviewListItem(
  review: AdminResidenceReviewRow,
  reportCount: number,
  latestModeration: LatestModeration | null,
): AdminResidenceReviewListItem {
  return {
    id: review.id,
    contentType: "RESIDENCE_REVIEW",
    isHidden: review.isHidden,
    rating: review.rating,
    title: review.title,
    content: review.content,
    author: {
      id: review.author.id,
      name: review.author.name,
      email: review.author.email,
    },
    region: {
      id: review.region.id,
      name: review.region.name,
    },
    reportCount,
    latestModeration,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

async function attachListMeta(
  reviews: AdminResidenceReviewRow[],
): Promise<AdminResidenceReviewListItem[]> {
  const targetIds = reviews.map((review) => String(review.id));

  const [reportGroups, moderationLogs] = await Promise.all([
    residenceReviewsRepository.countReportsByTargetIds(targetIds),
    residenceReviewsRepository.findModerationLogsByTargetIds(targetIds),
  ]);

  const reportCountMap = new Map(
    reportGroups.map((group) => [group.targetId, group._count._all] as const),
  );
  const latestMap = pickLatestModerationByTargetId(moderationLogs);

  return reviews.map((review) =>
    toAdminResidenceReviewListItem(
      review,
      reportCountMap.get(String(review.id)) ?? 0,
      latestMap.get(String(review.id)) ?? null,
    ),
  );
}

function getResidenceReviewNotificationContent(review: AdminResidenceReviewRow): string {
  return `「${review.title}」`;
}

async function toggleResidenceReviewVisibility(params: {
  adminId: string;
  residenceReviewId: number;
  action: VisibilityToggleAction;
  reason: string | null;
}): Promise<AdminResidenceReviewListItem> {
  const { adminId, residenceReviewId, action, reason } = params;
  const config = VISIBILITY_TOGGLE_CONFIG[action];

  const result = await runTransaction(async (tx) => {
    const review = await residenceReviewsRepository.findResidenceReviewById(residenceReviewId, tx);

    if (!review) {
      throw new AppError("CONTENT_NOT_FOUND");
    }

    const updated = await residenceReviewsRepository.updateResidenceReviewHiddenIf(
      residenceReviewId,
      config.expectedHidden,
      config.nextHidden,
      tx,
    );

    if (!updated) {
      throw new AppError(config.conflictError);
    }

    await residenceReviewsRepository.createActivityLog(
      {
        actorId: adminId,
        action: config.logAction,
        targetId: String(residenceReviewId),
        memo: reason,
      },
      tx,
    );

    await residenceReviewsRepository.syncRegionReviewStatistic(updated.regionId, tx);

    const notification = await notificationService.createNotification(
      {
        userId: review.authorId,
        type: config.notificationType,
        title: config.notificationTitle,
        content: getResidenceReviewNotificationContent(review),
        linkUrl: null,
        expiresAt: null,
      },
      tx,
    );

    return { updated, notification, authorId: review.authorId };
  });

  notificationService.sendNotification(result.authorId, result.notification);

  const items = await attachListMeta([result.updated]);
  const item = items[0];
  if (!item) {
    throw new AppError("CONTENT_NOT_FOUND");
  }
  return item;
}

export const residenceReviewsService = {
  getResidenceReviewList: async (query: ListAdminResidenceReviewsQuery) => {
    const { page, limit, sort } = query;

    const { reviews, totalCount } = await residenceReviewsRepository.findResidenceReviewsWithCount({
      skip: (page - 1) * limit,
      take: limit,
      filters: buildListFilters(query),
      sort,
    });

    const items = await attachListMeta(reviews);

    return {
      items,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  hideResidenceReview: async (params: {
    adminId: string;
    residenceReviewId: number;
    input: HideResidenceReviewBody;
  }): Promise<AdminResidenceReviewListItem> => {
    return toggleResidenceReviewVisibility({
      adminId: params.adminId,
      residenceReviewId: params.residenceReviewId,
      action: "HIDE",
      reason: params.input.reason,
    });
  },

  unhideResidenceReview: async (params: {
    adminId: string;
    residenceReviewId: number;
  }): Promise<AdminResidenceReviewListItem> => {
    return toggleResidenceReviewVisibility({
      adminId: params.adminId,
      residenceReviewId: params.residenceReviewId,
      action: "UNHIDE",
      reason: null,
    });
  },
};
