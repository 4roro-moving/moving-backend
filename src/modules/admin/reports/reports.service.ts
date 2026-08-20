import { NotificationType, ReportStatus, ReportTargetType } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { buildPagination } from "../../../utils/pagination.util";
import { runTransaction, type DbClient } from "../../../utils/transaction";
import { notificationService } from "../../notification/notification.service";

import {
  mapAdminReportDetail,
  mapAdminReportListItem,
  mapGiveawayReportTarget,
  mapMoverReportTarget,
  mapResidenceReviewReportTarget,
  mapReviewReportTarget,
} from "./reports.mapper";
import {
  assertReportPending,
  parseNumericReportTargetId,
  parseUuidReportTargetId,
} from "./reports.policy";
import {
  reportsRepository,
  type AdminReportDetailRow,
  type AdminReportListFilters,
  type AdminReportRow,
  type GiveawayReportTarget,
  type MoverReportTarget,
  type ResidenceReviewReportTarget,
  type ReviewReportTarget,
} from "./reports.repository";
import type { AdminReportTarget, HandleReportBody, ListAdminReportsQuery } from "./reports.type";
import type {
  CreateNotificationInput,
  NotificationItem,
} from "../../notification/notification.type";

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
type NotificationDbClient = Parameters<typeof notificationService.createNotification>[1];

const REPORT_RESULT_NOTIFICATION_EXPIRES_IN_DAYS = 30;

export interface ReportsRepository {
  findReportsWithCount(
    params: FindReportsParams,
    db?: DbClient,
  ): Promise<{
    reports: AdminReportRow[];
    totalCount: number;
  }>;

  findReportById(reportId: number, db?: DbClient): Promise<AdminReportDetailRow | null>;

  updateReportIfPending(
    params: UpdateReportParams,
    db?: DbClient,
  ): Promise<AdminReportDetailRow | null>;

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

interface ReportsNotificationService {
  createNotification(
    input: CreateNotificationInput,
    db?: NotificationDbClient,
  ): Promise<NotificationItem>;
  sendNotification(userId: string, notification: NotificationItem): void;
}

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
  notifications: ReportsNotificationService = notificationService,
) {
  function resolveNotificationLinkUrl(): string | undefined {
    return undefined;
  }

  function resolveNotificationExpiresAt(handledAt: Date): Date {
    return new Date(
      handledAt.getTime() + REPORT_RESULT_NOTIFICATION_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    );
  }

  function buildReportResultNotificationInput(params: {
    reporterId: string;
    reportId: number;
    status: typeof ReportStatus.RESOLVED | typeof ReportStatus.REJECTED;
    handledAt: Date;
  }): CreateNotificationInput {
    const base = {
      userId: params.reporterId,
      type: NotificationType.REPORT_RESULT,
      sourceId: `report:${String(params.reportId)}`,
      expiresAt: resolveNotificationExpiresAt(params.handledAt),
    } satisfies Pick<CreateNotificationInput, "userId" | "type" | "sourceId" | "expiresAt">;

    const linkUrl = resolveNotificationLinkUrl();

    if (params.status === ReportStatus.RESOLVED) {
      return {
        ...base,
        title: "신고 처리가 완료되었어요",
        content: "신고하신 내용에 대한 조치가 완료되었습니다.",
        ...(linkUrl !== undefined && {
          linkUrl,
        }),
      };
    }

    return {
      ...base,
      title: "신고 검토가 완료되었어요",
      content: "신고하신 내용을 검토한 결과 별도 조치 없이 종료되었습니다.",
      ...(linkUrl !== undefined && {
        linkUrl,
      }),
    };
  }

  async function getReportTarget(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<AdminReportTarget | null> {
    switch (targetType) {
      case ReportTargetType.REVIEW: {
        const reviewId = parseNumericReportTargetId(targetId);

        if (reviewId === null) {
          return null;
        }

        const target = await repository.findReviewTargetById(reviewId);

        return target ? mapReviewReportTarget(target) : null;
      }

      case ReportTargetType.MOVER: {
        const moverId = parseUuidReportTargetId(targetId);

        if (moverId === null) {
          return null;
        }

        const target = await repository.findMoverTargetById(moverId);

        return target ? mapMoverReportTarget(target) : null;
      }

      case ReportTargetType.RESIDENCE_REVIEW: {
        const residenceReviewId = parseNumericReportTargetId(targetId);

        if (residenceReviewId === null) {
          return null;
        }

        const target = await repository.findResidenceReviewTargetById(residenceReviewId);

        return target ? mapResidenceReviewReportTarget(target) : null;
      }

      case ReportTargetType.GIVEAWAY: {
        const giveawayId = parseNumericReportTargetId(targetId);

        if (giveawayId === null) {
          return null;
        }

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

      return mapAdminReportDetail(report, target);
    },

    async handleReport(params: { adminId: string; reportId: number; input: HandleReportBody }) {
      const { adminId, reportId, input } = params;

      const result = await transactionRunner(async (tx) => {
        const report = await repository.findReportById(reportId, tx);

        if (!report) {
          throw new AppError("NOT_FOUND", {
            message: "신고를 찾을 수 없습니다.",
          });
        }

        assertReportPending(report.status);

        const handledAt = new Date();

        const updated = await repository.updateReportIfPending(
          {
            reportId,
            status: input.status,
            handledBy: adminId,
            handledAt,
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

        const notification = await notifications.createNotification(
          buildReportResultNotificationInput({
            reporterId: report.reporterId,
            reportId,
            status: input.status,
            handledAt,
          }),
          tx,
        );

        return {
          report: mapAdminReportListItem(updated),
          reporterId: report.reporterId,
          notification,
        };
      });

      notifications.sendNotification(result.reporterId, result.notification);

      return result.report;
    },
  };
}

export const reportsService = createReportsService();
