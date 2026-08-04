import { LogAction, ReportTargetType, type Prisma } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { prisma } from "../../../lib/prisma";
import { notificationService } from "../../notification/notification.service";
import { buildPagination } from "../../../utils/pagination.util";
import { runTransaction } from "../../../utils/transaction";

import { contentsRepository, type AdminReviewRow } from "./contents.repository";
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

function buildReviewOrderBy(
  sort: ListAdminReviewsQuery["sort"],
): Prisma.ReviewOrderByWithRelationInput[] {
  switch (sort) {
    case "OLDEST":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "RATING_HIGH":
      return [{ rating: "desc" }, { createdAt: "desc" }, { id: "desc" }];
    case "RATING_LOW":
      return [{ rating: "asc" }, { createdAt: "desc" }, { id: "desc" }];
    case "LATEST":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

async function buildReviewWhere(query: ListAdminReviewsQuery): Promise<Prisma.ReviewWhereInput> {
  const where: Prisma.ReviewWhereInput = {};

  if (query.isHidden !== undefined) {
    where.isHidden = query.isHidden;
  }

  if (query.keyword) {
    where.OR = [
      { content: { contains: query.keyword, mode: "insensitive" } },
      { customer: { name: { contains: query.keyword, mode: "insensitive" } } },
    ];
  }

  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) {
      where.createdAt.gte = toStartOfDay(query.from);
    }
    if (query.to) {
      where.createdAt.lte = toEndOfDay(query.to);
    }
  }

  if (query.reportedOnly) {
    const reported = await prisma.report.groupBy({
      by: ["targetId"],
      where: { targetType: ReportTargetType.REVIEW },
    });

    const reportedIds = reported
      .map((row) => Number(row.targetId))
      .filter((id) => Number.isInteger(id) && id > 0);

    // 신고가 한 건도 없으면 빈 목록이 되도록 불가능한 id 조건을 둔다.
    where.id = { in: reportedIds.length > 0 ? reportedIds : [-1] };
  }

  return where;
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

export const contentsService = {
  async getReviewList(query: ListAdminReviewsQuery) {
    const { page, limit, sort } = query;
    const where = await buildReviewWhere(query);
    const orderBy = buildReviewOrderBy(sort);

    const { reviews, totalCount } = await contentsRepository.findReviewsWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where,
      orderBy,
    });

    const items = await attachListMeta(reviews);

    return {
      items,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  async hideReview(params: { adminId: string; reviewId: number; input: HideContentBody }) {
    const { adminId, reviewId, input } = params;

    const result = await runTransaction(async (tx) => {
      const review = await contentsRepository.findReviewById(reviewId, tx);

      if (!review) {
        throw new AppError("CONTENT_NOT_FOUND");
      }

      const updated = await contentsRepository.updateReviewHiddenIf(reviewId, false, true, tx);

      if (!updated) {
        throw new AppError("CONTENT_ALREADY_HIDDEN");
      }

      await contentsRepository.createActivityLog(
        {
          actorId: adminId,
          action: LogAction.HIDE,
          targetId: String(reviewId),
          memo: input.reason,
        },
        tx,
      );

      const notification = await notificationService.createNotification(
        {
          userId: review.customerId,
          type: "CONTENT_HIDDEN",
          title: "리뷰가 숨김 처리되었습니다",
          content: input.reason,
          linkUrl: null,
          expiresAt: null,
        },
        tx,
      );

      return { updated, notification, authorId: review.customerId };
    });

    notificationService.sendNotification(result.authorId, result.notification);

    const [item] = await attachListMeta([result.updated]);

    return item;
  },

  async unhideReview(params: { adminId: string; reviewId: number; input: UnhideContentBody }) {
    const { adminId, reviewId, input } = params;
    const reason = input.reason ?? null;

    const result = await runTransaction(async (tx) => {
      const review = await contentsRepository.findReviewById(reviewId, tx);

      if (!review) {
        throw new AppError("CONTENT_NOT_FOUND");
      }

      const updated = await contentsRepository.updateReviewHiddenIf(reviewId, true, false, tx);

      if (!updated) {
        throw new AppError("CONTENT_NOT_HIDDEN");
      }

      await contentsRepository.createActivityLog(
        {
          actorId: adminId,
          action: LogAction.UNHIDE,
          targetId: String(reviewId),
          memo: reason,
        },
        tx,
      );

      const notification = await notificationService.createNotification(
        {
          userId: review.customerId,
          type: "CONTENT_RESTORED",
          title: "리뷰 숨김이 해제되었습니다",
          content: reason ?? "관리자에 의해 리뷰가 다시 공개되었습니다.",
          linkUrl: null,
          expiresAt: null,
        },
        tx,
      );

      return { updated, notification, authorId: review.customerId };
    });

    notificationService.sendNotification(result.authorId, result.notification);

    const [item] = await attachListMeta([result.updated]);

    return item;
  },
};
