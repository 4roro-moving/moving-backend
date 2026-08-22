import { Prisma, UserRole } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { getImageUrl } from "../../utils/image-url";
import { buildPagination } from "../../utils/pagination.util";
import { runTransaction, type DbClient } from "../../utils/transaction";

import {
  reportRepository,
  type MyReportRecord,
  type ReportRecord,
  type ReportRepository,
} from "./report.repository";
import { reportImageService } from "./report-image.service";
import type {
  CreateReportInput,
  ListMyReportsQuery,
  MyReportItem,
  ReportItem,
} from "./report.type";

function toNumericTargetIdNumber(targetId: string): number {
  return Number(targetId);
}

function normalizeTargetId(targetType: CreateReportInput["targetType"], targetId: string): string {
  if (targetType === "REVIEW" || targetType === "RESIDENCE_REVIEW" || targetType === "GIVEAWAY") {
    return String(toNumericTargetIdNumber(targetId));
  }

  return targetId.toLowerCase();
}

function toReportItem(report: ReportRecord): ReportItem {
  return {
    id: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
    reason: report.reason,
    status: report.status,
    description: report.detail ?? null,
    images: report.images.map((image) => ({
      id: image.id,
      imageUrl: getImageUrl(image.imageKey) ?? "",
    })),
    createdAt: report.createdAt,
  };
}

function toMyReportItem(report: MyReportRecord): MyReportItem {
  return {
    id: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
    reason: report.reason,
    status: report.status,
    description: report.detail ?? null,
    handledAt: report.handledAt,
    createdAt: report.createdAt,
  };
}

function normalizeErrorMetaIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const reportUniqueMetaFields = ["targettype", "targetid", "reporterid"] as const;
const reportModelMetaIdentifiers = ["report", "reports"] as const;

function hasAllReportUniqueFields(values: string[]): boolean {
  return reportUniqueMetaFields.every((field) => values.includes(field));
}

function hasSomeReportUniqueField(values: string[]): boolean {
  return values.some((value) =>
    reportUniqueMetaFields.includes(value as (typeof reportUniqueMetaFields)[number]),
  );
}

function isReportModelMetaIdentifier(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = normalizeErrorMetaIdentifier(value);

  return reportModelMetaIdentifiers.some((identifier) => identifier === normalized);
}

function hasAllReportUniqueFieldsInString(value: string): boolean {
  const normalized = normalizeErrorMetaIdentifier(value);

  return reportUniqueMetaFields.every((field) => normalized.includes(field));
}

function hasSomeReportUniqueFieldInString(value: string): boolean {
  const normalized = normalizeErrorMetaIdentifier(value);

  return reportUniqueMetaFields.some((field) => normalized.includes(field));
}

function isLikelyReportConstraintName(value: string): boolean {
  const normalized = normalizeErrorMetaIdentifier(value);

  return (
    reportModelMetaIdentifiers.some((identifier) => normalized.includes(identifier)) &&
    reportUniqueMetaFields.every((field) => normalized.includes(field))
  );
}

function isReportUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  const isReportModel = isReportModelMetaIdentifier(error.meta?.modelName);
  const hasExplicitNonReportModel =
    typeof error.meta?.modelName === "string" &&
    normalizeErrorMetaIdentifier(error.meta.modelName).length > 0 &&
    !isReportModel;

  if (hasExplicitNonReportModel) {
    return false;
  }

  if (Array.isArray(target)) {
    const normalized = target.map((field) => normalizeErrorMetaIdentifier(String(field)));

    if (hasAllReportUniqueFields(normalized)) {
      return true;
    }

    return isReportModel && hasSomeReportUniqueField(normalized);
  }

  if (typeof target === "string") {
    if (hasAllReportUniqueFieldsInString(target)) {
      return isReportModel || isLikelyReportConstraintName(target);
    }

    return isReportModel && hasSomeReportUniqueFieldInString(target);
  }

  return isReportModel;
}

type TransactionRunner = <T>(callback: (tx: DbClient) => Promise<T>) => Promise<T>;

interface ReportImageManager {
  promoteUploadedImages(
    userId: string,
    imageKeys: string[] | undefined,
  ): Promise<{
    tempKeys: string[];
    finalKeys: string[];
  }>;

  cleanupTempImages(tempKeys: string[]): Promise<void>;
  cleanupFinalImages(finalKeys: string[]): Promise<void>;
}

export function createReportService(
  repository: ReportRepository = reportRepository,
  imageManager: ReportImageManager = reportImageService,
  transactionRunner: TransactionRunner = runTransaction,
) {
  return {
    async getMyReports(params: { reporterId: string; query: ListMyReportsQuery }) {
      const { reporterId, query } = params;
      const { page, limit } = query;

      const { reports, totalCount } = await repository.findMineWithCount({
        reporterId,
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        reports: reports.map(toMyReportItem),
        pagination: buildPagination(totalCount, page, limit),
      };
    },

    async createReport(params: {
      reporterId: string;
      input: CreateReportInput;
    }): Promise<ReportItem> {
      const { reporterId, input } = params;
      const normalizedTargetId = normalizeTargetId(input.targetType, input.targetId);
      const detail = input.description && input.description.length > 0 ? input.description : null;

      if (input.targetType === "REVIEW") {
        const reviewId = toNumericTargetIdNumber(normalizedTargetId);
        const review = await repository.findReviewTargetById(reviewId);

        if (!review) {
          throw new AppError("REPORT_TARGET_NOT_FOUND");
        }

        if (review.customerId === reporterId) {
          throw new AppError("REPORT_SELF_NOT_ALLOWED");
        }
      }

      if (input.targetType === "MOVER" || input.targetType === "CUSTOMER") {
        if (reporterId.toLowerCase() === normalizedTargetId) {
          throw new AppError("REPORT_SELF_NOT_ALLOWED");
        }

        const user = await repository.findUserById(normalizedTargetId);

        if (!user || user.deletedAt !== null) {
          throw new AppError("REPORT_TARGET_NOT_FOUND");
        }

        const expectedRole = input.targetType === "MOVER" ? UserRole.MOVER : UserRole.CUSTOMER;

        if (user.role !== expectedRole) {
          throw new AppError("REPORT_TARGET_NOT_REPORTABLE");
        }
      }

      if (input.targetType === "RESIDENCE_REVIEW") {
        const residenceReviewId = toNumericTargetIdNumber(normalizedTargetId);
        const residenceReview = await repository.findResidenceReviewTargetById(residenceReviewId);

        if (!residenceReview) {
          throw new AppError("REPORT_TARGET_NOT_FOUND");
        }

        if (residenceReview.authorId === reporterId) {
          throw new AppError("REPORT_SELF_NOT_ALLOWED");
        }
      }

      if (input.targetType === "GIVEAWAY") {
        const giveawayId = toNumericTargetIdNumber(normalizedTargetId);
        const giveaway = await repository.findGiveawayTargetById(giveawayId);

        if (!giveaway) {
          throw new AppError("REPORT_TARGET_NOT_FOUND");
        }

        if (giveaway.authorId === reporterId) {
          throw new AppError("REPORT_SELF_NOT_ALLOWED");
        }
      }

      const existingReport = await repository.findExistingReport({
        targetType: input.targetType,
        targetId: normalizedTargetId,
        reporterId,
      });

      if (existingReport) {
        throw new AppError("REPORT_ALREADY_EXISTS");
      }

      const promoted = await imageManager.promoteUploadedImages(reporterId, input.imageKeys);

      try {
        const created = await transactionRunner((tx) =>
          repository.createReport(
            {
              targetType: input.targetType,
              targetId: normalizedTargetId,
              reporterId,
              reason: input.reason,
              detail,
              status: "PENDING",
              ...(promoted.finalKeys.length > 0 && {
                imageKeys: promoted.finalKeys,
              }),
            },
            tx,
          ),
        );

        await imageManager.cleanupTempImages(promoted.tempKeys);

        return toReportItem(created);
      } catch (error) {
        await imageManager.cleanupFinalImages(promoted.finalKeys);

        if (isReportUniqueConstraintError(error)) {
          throw new AppError("REPORT_ALREADY_EXISTS");
        }

        throw error;
      }
    },
  };
}

export const reportService = createReportService();
