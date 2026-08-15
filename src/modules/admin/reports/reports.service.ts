import { ReportTargetType } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { buildPagination } from "../../../utils/pagination.util";
import { runTransaction, type DbClient } from "../../../utils/transaction";

import {
  mapAdminReportListItem,
  mapGiveawayReportTarget,
  mapMoverReportTarget,
  mapResidenceReviewReportTarget,
  mapReviewReportTarget,
} from "./reports.mapper";
import { assertReportPending, parseNumericReportTargetId } from "./reports.policy";
import {
  reportsRepository,
  type AdminReportListFilters,
  type AdminReportRow,
  type GiveawayReportTarget,
  type MoverReportTarget,
  type ResidenceReviewReportTarget,
  type ReviewReportTarget,
} from "./reports.repository";
import type { AdminReportTarget, HandleReportBody, ListAdminReportsQuery } from "./reports.type";

type FindReportsParams = {
  skip: number;
  take: number;
  filters: AdminReportListFilters;
  sort: ListAdminReportsQuery["sort"];
};

type UpdateReportParams = {
  reportId: number;
  status: HandleReportBody["status"];
  handledBy: string;
  handledAt: Date;
  handlerNote: string;
};

type CreateActivityLogInput = {
  actorId: string;
  targetId: string;
  memo: string;
};

type ActivityLogResult = Awaited<ReturnType<typeof reportsRepository.createActivityLog>>;

export interface ReportsRepository {
  findReportsWithCount(
    params: FindReportsParams,
    db?: DbClient,
  ): Promise<{
    reports: AdminReportRow[];
    totalCount: number;
  }>;

  findReportById(reportId: number, db?: DbClient): Promise<AdminReportRow | null>;

  updateReportIfPending(params: UpdateReportParams, db?: DbClient): Promise<AdminReportRow | null>;

  findReviewTargetById(reviewId: number, db?: DbClient): Promise<ReviewReportTarget>;

  findMoverTargetById(moverId: string, db?: DbClient): Promise<MoverReportTarget>;

  findResidenceReviewTargetById(
    residenceReviewId: number,
    db?: DbClient,
  ): Promise<ResidenceReviewReportTarget>;

  findGiveawayTargetById(giveawayId: number, db?: DbClient): Promise<GiveawayReportTarget>;

  createActivityLog(input: CreateActivityLogInput, db?: DbClient): Promise<ActivityLogResult>;
}

type TransactionRunner = <T>(callback: (tx: DbClient) => Promise<T>) => Promise<T>;

function buildListFilters(query: ListAdminReportsQuery): AdminReportListFilters {
  const filters: AdminReportListFilters = {};

  if (query.status !== undefined) {
    filters.status = query.status;
  }

  if (query.targetType !== undefined) {
    filters.targetType = query.targetType;
  }

  if (query.reason !== undefined) {
    filters.reason = query.reason;
  }

  if (query.keyword !== undefined) {
    filters.keyword = query.keyword;
  }

  return filters;
}

export function createReportsService(
  repository: ReportsRepository = reportsRepository,
  transactionRunner: TransactionRunner = runTransaction,
) {
  async function getReportTarget(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<AdminReportTarget | null> {
    switch (targetType) {
      case ReportTargetType.REVIEW: {
        const reviewId = parseNumericReportTargetId(targetId);
        const target = await repository.findReviewTargetById(reviewId);

        return target ? mapReviewReportTarget(target) : null;
      }

      case ReportTargetType.MOVER: {
        const target = await repository.findMoverTargetById(targetId);

        return target ? mapMoverReportTarget(target) : null;
      }

      case ReportTargetType.RESIDENCE_REVIEW: {
        const residenceReviewId = parseNumericReportTargetId(targetId);

        const target = await repository.findResidenceReviewTargetById(residenceReviewId);

        return target ? mapResidenceReviewReportTarget(target) : null;
      }

      case ReportTargetType.GIVEAWAY: {
        const giveawayId = parseNumericReportTargetId(targetId);

        const target = await repository.findGiveawayTargetById(giveawayId);

        return target ? mapGiveawayReportTarget(target) : null;
      }
    }
  }

  return {
    async getReportList(query: ListAdminReportsQuery) {
      const { page, limit, sort } = query;

      const { reports, totalCount } = await repository.findReportsWithCount({
        skip: (page - 1) * limit,
        take: limit,
        filters: buildListFilters(query),
        sort,
      });

      return {
        items: reports.map(mapAdminReportListItem),
        pagination: buildPagination(totalCount, page, limit),
      };
    },

    async getReportDetail(reportId: number) {
      const report = await repository.findReportById(reportId);

      if (!report) {
        throw new AppError("NOT_FOUND", {
          message: "신고를 찾을 수 없습니다.",
        });
      }

      const target = await getReportTarget(report.targetType, report.targetId);

      return {
        ...mapAdminReportListItem(report),
        target,
      };
    },

    async handleReport(params: { adminId: string; reportId: number; input: HandleReportBody }) {
      const { adminId, reportId, input } = params;

      return transactionRunner(async (tx) => {
        const report = await repository.findReportById(reportId, tx);

        if (!report) {
          throw new AppError("NOT_FOUND", {
            message: "신고를 찾을 수 없습니다.",
          });
        }

        assertReportPending(report.status);

        const updated = await repository.updateReportIfPending(
          {
            reportId,
            status: input.status,
            handledBy: adminId,
            handledAt: new Date(),
            handlerNote: input.handlerNote,
          },
          tx,
        );

        if (!updated) {
          throw new AppError("CONFLICT", {
            message: "이미 처리된 신고입니다.",
          });
        }

        await repository.createActivityLog(
          {
            actorId: adminId,
            targetId: String(reportId),
            memo: input.handlerNote,
          },
          tx,
        );

        return mapAdminReportListItem(updated);
      });
    },
  };
}

export const reportsService = createReportsService();
