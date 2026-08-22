import { LogAction, LogTargetType } from "@prisma/client";

import { AppError } from "../../lib/app-error";

import { myContentRepository } from "./my-content.repository";
import type { MyContentDetail, MyContentLatestModeration, MyContentType } from "./my-content.type";

function toLatestModeration(
  log: Awaited<ReturnType<typeof myContentRepository.findLatestModerationLog>>,
): MyContentLatestModeration | null {
  if (!log) {
    return null;
  }

  if (log.action !== LogAction.HIDE && log.action !== LogAction.UNHIDE) {
    return null;
  }

  return {
    action: log.action,
    reason: log.memo,
    adminName: log.actor.name,
    createdAt: log.createdAt,
  };
}

async function getReviewDetail(contentId: number, userId: string): Promise<MyContentDetail> {
  const review = await myContentRepository.findOwnedReview(contentId, userId);
  if (!review) {
    throw new AppError("CONTENT_NOT_FOUND");
  }

  const log = await myContentRepository.findLatestModerationLog(
    LogTargetType.REVIEW,
    String(contentId),
  );
  const moverName = review.mover.moverProfile?.nickname ?? review.mover.name;

  return {
    contentType: "REVIEW",
    id: review.id,
    isHidden: review.isHidden,
    authorName: review.customer.name,
    createdAt: review.createdAt,
    rating: review.rating,
    title: null,
    body: review.content,
    meta: `기사님 ${moverName}`,
    latestModeration: toLatestModeration(log),
  };
}

async function getResidenceReviewDetail(
  contentId: number,
  userId: string,
): Promise<MyContentDetail> {
  const review = await myContentRepository.findOwnedResidenceReview(contentId, userId);
  if (!review) {
    throw new AppError("CONTENT_NOT_FOUND");
  }

  const log = await myContentRepository.findLatestModerationLog(
    LogTargetType.RESIDENCE_REVIEW,
    String(contentId),
  );

  return {
    contentType: "RESIDENCE_REVIEW",
    id: review.id,
    isHidden: review.isHidden,
    authorName: review.author.name,
    createdAt: review.createdAt,
    rating: review.rating,
    title: review.title,
    body: review.content,
    meta: review.region.name,
    latestModeration: toLatestModeration(log),
  };
}

async function getGiveawayDetail(contentId: number, userId: string): Promise<MyContentDetail> {
  const giveaway = await myContentRepository.findOwnedGiveaway(contentId, userId);
  if (!giveaway) {
    throw new AppError("CONTENT_NOT_FOUND");
  }

  const log = await myContentRepository.findLatestModerationLog(
    LogTargetType.GIVEAWAY,
    String(contentId),
  );

  return {
    contentType: "GIVEAWAY",
    id: giveaway.id,
    isHidden: giveaway.isHidden,
    authorName: giveaway.author.name,
    createdAt: giveaway.createdAt,
    rating: null,
    title: giveaway.title,
    body: giveaway.description,
    meta: giveaway.region?.name ?? "지역 미지정",
    latestModeration: toLatestModeration(log),
  };
}

export const myContentService = {
  getMyContentDetail: async (
    contentType: MyContentType,
    contentId: number,
    userId: string,
  ): Promise<MyContentDetail> => {
    switch (contentType) {
      case "review":
        return getReviewDetail(contentId, userId);
      case "residence-review":
        return getResidenceReviewDetail(contentId, userId);
      case "giveaway":
        return getGiveawayDetail(contentId, userId);
      default: {
        const _exhaustive: never = contentType;
        throw new AppError("CONTENT_NOT_FOUND", { message: String(_exhaustive) });
      }
    }
  },
};
