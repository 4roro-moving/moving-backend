import type { ReportReason, ReportStatus, ReportTargetType, UserRole } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

const reportSelect = {
  id: true,
  targetType: true,
  targetId: true,
  reason: true,
  status: true,
  detail: true,
  images: {
    orderBy: {
      id: "asc",
    },
    select: {
      id: true,
      imageKey: true,
    },
  },
  createdAt: true,
} as const;

const myReportSelect = {
  id: true,
  targetType: true,
  targetId: true,
  reason: true,
  status: true,
  detail: true,
  handledAt: true,
  createdAt: true,
} as const;

export const reportRepository = {
  findReviewTargetById(reviewId: number, db: DbClient = prisma) {
    return db.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        customerId: true,
        moverId: true,
      },
    });
  },

  findUserById(userId: string, db: DbClient = prisma) {
    return db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        deletedAt: true,
      },
    });
  },

  findResidenceReviewTargetById(residenceReviewId: number, db: DbClient = prisma) {
    return db.residenceReview.findUnique({
      where: { id: residenceReviewId },
      select: {
        id: true,
        authorId: true,
      },
    });
  },

  findGiveawayTargetById(giveawayId: number, db: DbClient = prisma) {
    return db.giveaway.findUnique({
      where: { id: giveawayId },
      select: {
        id: true,
        authorId: true,
      },
    });
  },

  findExistingReport(
    params: {
      targetType: ReportTargetType;
      targetId: string;
      reporterId: string;
    },
    db: DbClient = prisma,
  ) {
    return db.report.findUnique({
      where: {
        targetType_targetId_reporterId: {
          targetType: params.targetType,
          targetId: params.targetId,
          reporterId: params.reporterId,
        },
      },
      select: {
        id: true,
      },
    });
  },

  async findMineWithCount(
    params: {
      reporterId: string;
      skip: number;
      take: number;
    },
    db: DbClient = prisma,
  ) {
    const where = {
      reporterId: params.reporterId,
    };

    const [reports, totalCount] = await Promise.all([
      db.report.findMany({
        where,
        select: myReportSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: params.skip,
        take: params.take,
      }),
      db.report.count({ where }),
    ]);

    return { reports, totalCount };
  },

  createReport(
    input: {
      targetType: ReportTargetType;
      targetId: string;
      reporterId: string;
      reason: ReportReason;
      detail: string | null;
      status: ReportStatus;
      imageKeys?: string[];
    },
    db: DbClient = prisma,
  ) {
    return db.report.create({
      data: {
        targetType: input.targetType,
        targetId: input.targetId,
        reporterId: input.reporterId,
        reason: input.reason,
        detail: input.detail,
        status: input.status,
        ...(input.imageKeys !== undefined &&
          input.imageKeys.length > 0 && {
            images: {
              create: input.imageKeys.map((imageKey) => ({
                imageKey,
              })),
            },
          }),
      },
      select: reportSelect,
    });
  },
};

export type ReviewReportTarget = {
  id: number;
  customerId: string;
  moverId: string;
};

export type ReportableUser = {
  id: string;
  role: UserRole;
  deletedAt: Date | null;
};

export type ResidenceReviewReportTarget = {
  id: number;
  authorId: string;
};

export type GiveawayReportTarget = {
  id: number;
  authorId: string;
};

export type ExistingReport = {
  id: number;
};

export type ReportRecord = Awaited<ReturnType<typeof reportRepository.createReport>>;
export type MyReportRecord = Awaited<
  ReturnType<typeof reportRepository.findMineWithCount>
>["reports"][number];

export interface ReportRepository {
  findReviewTargetById(reviewId: number, db?: DbClient): Promise<ReviewReportTarget | null>;
  findUserById(userId: string, db?: DbClient): Promise<ReportableUser | null>;
  findResidenceReviewTargetById(
    residenceReviewId: number,
    db?: DbClient,
  ): Promise<ResidenceReviewReportTarget | null>;
  findGiveawayTargetById(giveawayId: number, db?: DbClient): Promise<GiveawayReportTarget | null>;
  findExistingReport(
    params: {
      targetType: ReportTargetType;
      targetId: string;
      reporterId: string;
    },
    db?: DbClient,
  ): Promise<ExistingReport | null>;
  findMineWithCount(
    params: {
      reporterId: string;
      skip: number;
      take: number;
    },
    db?: DbClient,
  ): Promise<{
    reports: MyReportRecord[];
    totalCount: number;
  }>;
  createReport(
    input: {
      targetType: ReportTargetType;
      targetId: string;
      reporterId: string;
      reason: ReportReason;
      detail: string | null;
      status: ReportStatus;
      imageKeys?: string[];
    },
    db?: DbClient,
  ): Promise<ReportRecord>;
}
