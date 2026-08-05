import { Prisma, UserRole } from "@prisma/client";

import { AppError } from "../../lib/app-error";

import { reportRepository, type ReportRecord, type ReportRepository } from "./report.repository";
import type { CreateReportInput, ReportItem } from "./report.type";

function toReviewTargetIdNumber(targetId: string): number {
  return Number(targetId);
}

function normalizeTargetId(targetType: CreateReportInput["targetType"], targetId: string): string {
  if (targetType === "REVIEW") {
    return String(toReviewTargetIdNumber(targetId));
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

export function createReportService(repository: ReportRepository = reportRepository) {
  return {
    async createReport(params: {
      reporterId: string;
      input: CreateReportInput;
    }): Promise<ReportItem> {
      const { reporterId, input } = params;
      const normalizedTargetId = normalizeTargetId(input.targetType, input.targetId);
      const detail = input.description && input.description.length > 0 ? input.description : null;

      if (input.targetType === "REVIEW") {
        const reviewId = toReviewTargetIdNumber(normalizedTargetId);
        const review = await repository.findReviewTargetById(reviewId);

        if (!review) {
          throw new AppError("REPORT_TARGET_NOT_FOUND");
        }

        if (review.customerId === reporterId) {
          throw new AppError("REPORT_SELF_NOT_ALLOWED");
        }
      }

      if (input.targetType === "MOVER") {
        if (reporterId.toLowerCase() === normalizedTargetId) {
          throw new AppError("REPORT_SELF_NOT_ALLOWED");
        }

        const user = await repository.findUserById(normalizedTargetId);

        if (!user || user.deletedAt !== null) {
          throw new AppError("REPORT_TARGET_NOT_FOUND");
        }

        if (user.role !== UserRole.MOVER) {
          throw new AppError("REPORT_TARGET_NOT_REPORTABLE");
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

      try {
        const created = await repository.createReport({
          targetType: input.targetType,
          targetId: normalizedTargetId,
          reporterId,
          reason: input.reason,
          detail,
          status: "PENDING",
        });

        return toReportItem(created);
      } catch (error) {
        if (isReportUniqueConstraintError(error)) {
          throw new AppError("REPORT_ALREADY_EXISTS");
        }

        throw error;
      }
    },
  };
}

export const reportService = createReportService();
