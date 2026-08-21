import type { Prisma } from "@prisma/client";
import {
  LogAction,
  LogTargetType,
  ReportStatus,
  UserRole,
  type ReportReason,
  type ReportTargetType,
} from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

import type { ListAdminReportsQuery } from "./reports.type";

const adminReportSelect = {
  id: true,
  targetType: true,
  targetId: true,
  reporterId: true,
  reason: true,
  detail: true,
  status: true,
  handledBy: true,
  handledAt: true,
  handlerNote: true,
  createdAt: true,
  updatedAt: true,

  reporter: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },

  handler: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.ReportSelect;

export type AdminReportRow = Prisma.ReportGetPayload<{
  select: typeof adminReportSelect;
}>;

const adminReportDetailSelect = {
  ...adminReportSelect,
  images: {
    orderBy: {
      id: "asc",
    },
    select: {
      id: true,
      imageKey: true,
    },
  },
} satisfies Prisma.ReportSelect;

export type AdminReportDetailRow = Prisma.ReportGetPayload<{
  select: typeof adminReportDetailSelect;
}>;

export type AdminReportListFilters = {
  status?: ReportStatus;
  targetType?: ReportTargetType;
  reason?: ReportReason;
  keyword?: string;
};

type FindReportsParams = {
  skip: number;
  take: number;
  filters: AdminReportListFilters;
  sort: ListAdminReportsQuery["sort"];
};

function toPrismaWhere(filters: AdminReportListFilters): Prisma.ReportWhereInput {
  const where: Prisma.ReportWhereInput = {};

  if (filters.status !== undefined) {
    where.status = filters.status;
  }

  if (filters.targetType !== undefined) {
    where.targetType = filters.targetType;
  }

  if (filters.reason !== undefined) {
    where.reason = filters.reason;
  }

  if (filters.keyword) {
    where.OR = [
      {
        targetId: {
          contains: filters.keyword,
          mode: "insensitive",
        },
      },
      {
        detail: {
          contains: filters.keyword,
          mode: "insensitive",
        },
      },
      {
        reporter: {
          name: {
            contains: filters.keyword,
            mode: "insensitive",
          },
        },
      },
      {
        reporter: {
          email: {
            contains: filters.keyword,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  return where;
}

function toPrismaOrderBy(
  sort: ListAdminReportsQuery["sort"],
): Prisma.ReportOrderByWithRelationInput[] {
  if (sort === "OLDEST") {
    return [{ createdAt: "asc" }, { id: "asc" }];
  }

  return [{ createdAt: "desc" }, { id: "desc" }];
}

export const reportsRepository = {
  findReportsWithCount({ skip, take, filters, sort }: FindReportsParams, db: DbClient = prisma) {
    const where = toPrismaWhere(filters);
    const orderBy = toPrismaOrderBy(sort);

    return Promise.all([
      db.report.findMany({
        where,
        skip,
        take,
        orderBy,
        select: adminReportSelect,
      }),

      db.report.count({
        where,
      }),
    ]).then(([reports, totalCount]) => ({
      reports,
      totalCount,
    }));
  },

  findReportById(reportId: number, db: DbClient = prisma) {
    return db.report.findUnique({
      where: {
        id: reportId,
      },
      select: adminReportDetailSelect,
    });
  },

  /**
   * PENDING 상태인 신고만 처리합니다.
   *
   * 동시에 여러 관리자가 같은 신고를 처리하려는 경우
   * 먼저 처리한 요청만 성공하도록 조건부 updateMany를 사용합니다.
   */
  async updateReportIfPending(
    params: {
      reportId: number;
      status: typeof ReportStatus.RESOLVED | typeof ReportStatus.REJECTED;
      handledBy: string;
      handledAt: Date;
      handlerNote: string;
    },
    db: DbClient = prisma,
  ): Promise<AdminReportDetailRow | null> {
    const result = await db.report.updateMany({
      where: {
        id: params.reportId,
        status: ReportStatus.PENDING,
      },
      data: {
        status: params.status,
        handledBy: params.handledBy,
        handledAt: params.handledAt,
        handlerNote: params.handlerNote,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return db.report.findUnique({
      where: {
        id: params.reportId,
      },
      select: adminReportDetailSelect,
    });
  },

  /**
   * REVIEW 신고 대상 상세 조회
   */
  findReviewTargetById(reviewId: number, db: DbClient = prisma) {
    return db.review.findUnique({
      where: {
        id: reviewId,
      },
      select: {
        id: true,
        rating: true,
        content: true,
        isHidden: true,
        createdAt: true,

        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },

        mover: {
          select: {
            id: true,
            name: true,

            moverProfile: {
              select: {
                nickname: true,
              },
            },
          },
        },
      },
    });
  },

  /**
   * MOVER 신고 대상 상세 조회
   *
   * Report.targetId에는 기사 User.id(UUID)가 저장됩니다.
   */
  findMoverTargetById(moverId: string, db: DbClient = prisma) {
    return db.user.findFirst({
      where: {
        id: moverId,
        role: UserRole.MOVER,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,

        moverProfile: {
          select: {
            nickname: true,
          },
        },
      },
    });
  },

  /**
   * RESIDENCE_REVIEW 신고 대상 상세 조회
   */
  findResidenceReviewTargetById(residenceReviewId: number, db: DbClient = prisma) {
    return db.residenceReview.findUnique({
      where: {
        id: residenceReviewId,
      },
      select: {
        id: true,
        title: true,
        content: true,
        rating: true,
        isHidden: true,
        createdAt: true,

        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },

        region: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },

  /**
   * GIVEAWAY 신고 대상 상세 조회
   */
  findGiveawayTargetById(giveawayId: number, db: DbClient = prisma) {
    return db.giveaway.findUnique({
      where: {
        id: giveawayId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        isHidden: true,
        createdAt: true,

        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },

        region: {
          select: {
            id: true,
            name: true,
          },
        },

        images: {
          orderBy: {
            sortOrder: "asc",
          },
          select: {
            id: true,
            imageKey: true,
            sortOrder: true,
          },
        },
      },
    });
  },

  /**
   * 관리자 신고 처리 이력을 ActivityLog에 남깁니다.
   */
  createActivityLog(
    input: {
      actorId: string;
      targetId: string;
      memo: string;
    },
    db: DbClient = prisma,
  ) {
    return db.activityLog.create({
      data: {
        actorId: input.actorId,
        actorRole: UserRole.ADMIN,
        action: LogAction.UPDATE,
        targetType: LogTargetType.REPORT,
        targetId: input.targetId,
        memo: input.memo,
      },
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        memo: true,
        createdAt: true,

        actor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },
};

export type ReviewReportTarget = Awaited<ReturnType<typeof reportsRepository.findReviewTargetById>>;

export type MoverReportTarget = Awaited<ReturnType<typeof reportsRepository.findMoverTargetById>>;

export type ResidenceReviewReportTarget = Awaited<
  ReturnType<typeof reportsRepository.findResidenceReviewTargetById>
>;

export type GiveawayReportTarget = Awaited<
  ReturnType<typeof reportsRepository.findGiveawayTargetById>
>;
