import { Prisma, UserRole } from "@prisma/client";

import { AppError } from "../../lib/app-error";

import { reportRepository, type ReportRecord, type ReportRepository } from "./report.repository";
import type { CreateReportInput, ReportItem } from "./report.type";

function normalizeTargetId(targetType: CreateReportInput["targetType"], targetId: string): string {
  if (targetType === "REVIEW") {
    return String(Number.parseInt(targetId, 10));
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

function isReportUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  const fields = ["target_type", "target_id", "reporter_id"];

  if (Array.isArray(target)) {
    const normalized = target.map((field) => String(field).toLowerCase());

    return fields.every((field) => normalized.includes(field));
  }

  const normalizedTarget = String(target).toLowerCase();

  return fields.every((field) => normalizedTarget.includes(field));
}

export function createReportService(repository: ReportRepository = reportRepository) {
  return {
    async createReport(params: { reporterId: string; input: CreateReportInput }): Promise<ReportItem> {
      const { reporterId, input } = params;
      const normalizedTargetId = normalizeTargetId(input.targetType, input.targetId);
      const detail = input.description && input.description.length > 0 ? input.description : null;

      if (input.targetType === "REVIEW") {
        const reviewId = Number.parseInt(normalizedTargetId, 10);
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
