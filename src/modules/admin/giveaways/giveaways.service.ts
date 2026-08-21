import { LogAction, type NotificationType } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { buildPagination } from "../../../utils/pagination.util";
import { runTransaction } from "../../../utils/transaction";
import { notificationService } from "../../notification/notification.service";

import { giveawaysRepository, type AdminGiveawayRow } from "./giveaways.repository";
import type {
  AdminGiveawayListItem,
  HideGiveawayBody,
  LatestModeration,
  ListAdminGiveawaysQuery,
} from "./giveaways.type";

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
    notificationTitle: "나눔글이 숨김 처리되었습니다",
  },
  UNHIDE: {
    expectedHidden: true,
    nextHidden: false,
    conflictError: "CONTENT_NOT_HIDDEN",
    logAction: LogAction.UNHIDE,
    notificationType: "CONTENT_RESTORED",
    notificationTitle: "나눔글 숨김이 해제되었습니다",
  },
};

function buildListFilters(query: ListAdminGiveawaysQuery) {
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
  logs: Awaited<ReturnType<typeof giveawaysRepository.findModerationLogsByTargetIds>>,
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
function toAdminGiveawayListItem(
  giveaway: AdminGiveawayRow,
  reportCount: number,
  latestModeration: LatestModeration | null,
): AdminGiveawayListItem {
  return {
    id: giveaway.id,
    contentType: "GIVEAWAY",
    isHidden: giveaway.isHidden,
    status: giveaway.status,
    title: giveaway.title,
    description: giveaway.description,
    author: {
      id: giveaway.author.id,
      name: giveaway.author.name,
      email: giveaway.author.email,
    },
    region: giveaway.region
      ? {
          id: giveaway.region.id,
          name: giveaway.region.name,
        }
      : null,
    reportCount,
    latestModeration,
    createdAt: giveaway.createdAt,
    updatedAt: giveaway.updatedAt,
  };
}

async function attachListMeta(giveaways: AdminGiveawayRow[]): Promise<AdminGiveawayListItem[]> {
  const targetIds = giveaways.map((giveaway) => String(giveaway.id));

  const [reportGroups, moderationLogs] = await Promise.all([
    giveawaysRepository.countReportsByTargetIds(targetIds),
    giveawaysRepository.findModerationLogsByTargetIds(targetIds),
  ]);

  const reportCountMap = new Map(
    reportGroups.map((group) => [group.targetId, group._count._all] as const),
  );
  const latestMap = pickLatestModerationByTargetId(moderationLogs);

  return giveaways.map((giveaway) =>
    toAdminGiveawayListItem(
      giveaway,
      reportCountMap.get(String(giveaway.id)) ?? 0,
      latestMap.get(String(giveaway.id)) ?? null,
    ),
  );
}

function getGiveawayNotificationContent(giveaway: AdminGiveawayRow): string {
  return `「${giveaway.title}」`;
}

async function toggleGiveawayVisibility(params: {
  adminId: string;
  giveawayId: number;
  action: VisibilityToggleAction;
  reason: string | null;
}): Promise<AdminGiveawayListItem> {
  const { adminId, giveawayId, action, reason } = params;
  const config = VISIBILITY_TOGGLE_CONFIG[action];

  const result = await runTransaction(async (tx) => {
    const giveaway = await giveawaysRepository.findGiveawayById(giveawayId, tx);

    if (!giveaway) {
      throw new AppError("CONTENT_NOT_FOUND");
    }

    const updated = await giveawaysRepository.updateGiveawayHiddenIf(
      giveawayId,
      config.expectedHidden,
      config.nextHidden,
      tx,
    );

    if (!updated) {
      throw new AppError(config.conflictError);
    }

    await giveawaysRepository.createActivityLog(
      {
        actorId: adminId,
        action: config.logAction,
        targetId: String(giveawayId),
        memo: reason,
      },
      tx,
    );

    const notification = await notificationService.createNotification(
      {
        userId: giveaway.authorId,
        type: config.notificationType,
        title: config.notificationTitle,
        content: getGiveawayNotificationContent(giveaway),
        linkUrl: null,
        expiresAt: null,
      },
      tx,
    );

    return { updated, notification, authorId: giveaway.authorId };
  });

  notificationService.sendNotification(result.authorId, result.notification);

  const items = await attachListMeta([result.updated]);
  const item = items[0];
  if (!item) {
    throw new AppError("CONTENT_NOT_FOUND");
  }
  return item;
}

export const giveawaysService = {
  getGiveawayList: async (query: ListAdminGiveawaysQuery) => {
    const { page, limit, sort } = query;

    const { giveaways, totalCount } = await giveawaysRepository.findGiveawaysWithCount({
      skip: (page - 1) * limit,
      take: limit,
      filters: buildListFilters(query),
      sort,
    });

    const items = await attachListMeta(giveaways);

    return {
      items,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  hideGiveaway: async (params: {
    adminId: string;
    giveawayId: number;
    input: HideGiveawayBody;
  }): Promise<AdminGiveawayListItem> => {
    return toggleGiveawayVisibility({
      adminId: params.adminId,
      giveawayId: params.giveawayId,
      action: "HIDE",
      reason: params.input.reason,
    });
  },

  unhideGiveaway: async (params: {
    adminId: string;
    giveawayId: number;
  }): Promise<AdminGiveawayListItem> => {
    return toggleGiveawayVisibility({
      adminId: params.adminId,
      giveawayId: params.giveawayId,
      action: "UNHIDE",
      reason: null,
    });
  },
};
