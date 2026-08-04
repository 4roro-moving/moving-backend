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

// Prisma meta.target은 보통 Prisma 필드명을 주지만, 환경에 따라 매핑된 식별자 형태가 달라도
// 동일 복합 unique 충돌을 놓치지 않도록 정규화한 식별자 기준으로 비교합니다.
const reportUniqueMetaFields = ["targettype", "targetid", "reporterid"] as const;

function hasAllReportUniqueFields(values: string[]): boolean {
  return reportUniqueMetaFields.every((field) => values.includes(field));
}

function hasSomeReportUniqueField(values: string[]): boolean {
  return values.some((value) => reportUniqueMetaFields.includes(value as (typeof reportUniqueMetaFields)[number]));
}

function isReportUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  const modelName = normalizeErrorMetaIdentifier(String(error.meta?.modelName ?? ""));

  if (Array.isArray(target)) {
    const normalized = target.map((field) => normalizeErrorMetaIdentifier(String(field)));

    if (hasAllReportUniqueFields(normalized)) {
      return true;
    }

    return modelName === "report" && hasSomeReportUniqueField(normalized);
  }

  if (typeof target === "string") {
    const normalizedTarget = normalizeErrorMetaIdentifier(target);

    if (reportUniqueMetaFields.every((field) => normalizedTarget.includes(field))) {
      return true;
    }

    return modelName === "report" && hasSomeReportUniqueField([normalizedTarget]);
  }

  // createReport 내부에서 발생한 P2002는 report.create 문맥이므로,
  // target 정보가 비어 있어도 Report 모델 충돌이면 중복 신고로 간주합니다.
  return modelName === "report";
}

export function createReportService(repository: ReportRepository = reportRepository) {
  return {
    async createReport(params: { reporterId: string; input: CreateReportInput }): Promise<ReportItem> {
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
