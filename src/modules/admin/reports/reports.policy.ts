import { ReportStatus } from "@prisma/client";
import { z } from "zod";

import { AppError } from "../../../lib/app-error";

const reportTargetUuidSchema = z.uuid();

export function assertReportPending(status: ReportStatus): void {
  if (status !== ReportStatus.PENDING) {
    throw new AppError("CONFLICT", {
      message: "이미 처리된 신고입니다.",
    });
  }
}

export function parseNumericReportTargetId(targetId: string): number | null {
  const id = Number(targetId);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

export function parseUuidReportTargetId(targetId: string): string | null {
  const result = reportTargetUuidSchema.safeParse(targetId);

  return result.success ? result.data : null;
}
