import { ReportStatus } from "@prisma/client";

import { AppError } from "../../../lib/app-error";

export function assertReportPending(status: ReportStatus): void {
  if (status !== ReportStatus.PENDING) {
    throw new AppError("CONFLICT", {
      message: "이미 처리된 신고입니다.",
    });
  }
}

export function parseNumericReportTargetId(targetId: string): number {
  const id = Number(targetId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("NOT_FOUND", {
      message: "신고 대상을 찾을 수 없습니다.",
    });
  }

  return id;
}
