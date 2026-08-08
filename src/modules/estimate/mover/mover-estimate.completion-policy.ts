import type { EstimateRequestStatus, EstimateStatus } from "@prisma/client";

import { AppError } from "../../../lib/app-error";

interface CompletableEstimate {
  id: number;
  status: EstimateStatus;
  estimateRequest: {
    status: EstimateRequestStatus;
    confirmedEstimateId: number | null;
    moveDate: Date;
  };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function getKstDateValue(date: Date): number {
  const kstDate = new Date(date.getTime() + KST_OFFSET_MS);

  return Date.UTC(kstDate.getUTCFullYear(), kstDate.getUTCMonth(), kstDate.getUTCDate());
}

export function assertCompletableEstimate(estimate: CompletableEstimate, now = new Date()): void {
  if (
    estimate.status !== "CONFIRMED" ||
    estimate.estimateRequest.status !== "CONFIRMED" ||
    estimate.estimateRequest.confirmedEstimateId !== estimate.id
  ) {
    throw new AppError("CONFLICT", {
      message: "확정된 본인 견적만 이사 완료 처리할 수 있습니다.",
    });
  }

  if (getKstDateValue(now) < getKstDateValue(estimate.estimateRequest.moveDate)) {
    throw new AppError("CONFLICT", {
      message: "이사 완료 처리는 이용일 당일부터 가능합니다.",
    });
  }
}
