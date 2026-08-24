import type { LogTargetType } from "@prisma/client";
import { LogAction } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

export const myContentRepository = {
  findOwnedReview(reviewId: number, customerId: string, db: DbClient = prisma) {
    return db.review.findFirst({
      where: {
        id: reviewId,
        customerId,
      },
      select: {
        id: true,
        isHidden: true,
        rating: true,
        content: true,
        createdAt: true,
        customer: {
          select: { name: true },
        },
        mover: {
          select: {
            name: true,
            moverProfile: {
              select: { nickname: true },
            },
          },
        },
      },
    });
  },

  findOwnedResidenceReview(residenceReviewId: number, authorId: string, db: DbClient = prisma) {
    return db.residenceReview.findFirst({
      where: {
        id: residenceReviewId,
        authorId,
      },
      select: {
        id: true,
        isHidden: true,
        rating: true,
        title: true,
        content: true,
        createdAt: true,
        author: {
          select: { name: true },
        },
        region: {
          select: { name: true },
        },
      },
    });
  },

  findOwnedGiveaway(giveawayId: number, authorId: string, db: DbClient = prisma) {
    return db.giveaway.findFirst({
      where: {
        id: giveawayId,
        authorId,
      },
      select: {
        id: true,
        isHidden: true,
        title: true,
        description: true,
        createdAt: true,
        author: {
          select: { name: true },
        },
        region: {
          select: { name: true },
        },
      },
    });
  },

  findLatestModerationLog(targetType: LogTargetType, targetId: string, db: DbClient = prisma) {
    return db.activityLog.findFirst({
      where: {
        targetType,
        targetId,
        action: { in: [LogAction.HIDE, LogAction.UNHIDE] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        action: true,
        memo: true,
        createdAt: true,
        actor: {
          select: { name: true },
        },
      },
    });
  },
};
