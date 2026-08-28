import type { EstimateRequestStatus, EstimateStatus } from "@prisma/client";

import { AppError } from "../../../lib/app-error";

type ConfirmStateParams = {
  estimateId: number;
  estimateStatus: EstimateStatus;
  requestStatus: EstimateRequestStatus;
  confirmedEstimateId: number | null;
};

export function getConfirmDisabledReason(
  estimateStatus: EstimateStatus,
  requestStatus: EstimateRequestStatus,
  isConfirmed: boolean,
): string | null {
  if (isConfirmed) {
    return null;
  }

  if (estimateStatus === "SENT" && requestStatus === "OPEN") {
    return null;
  }

  if (
    estimateStatus === "SENT" &&
    (requestStatus === "CONFIRMED" || requestStatus === "COMPLETED")
  ) {
    return "이미 확정된 견적이 있어 추가로 확정할 수 없습니다.";
  }

  if (estimateStatus === "CONFIRMED") {
    return null;
  }

  return "확정할 수 없는 견적입니다.";
}

export function getReceivedEstimateConfirmState({
  estimateId,
  estimateStatus,
  requestStatus,
  confirmedEstimateId,
}: ConfirmStateParams) {
  const isConfirmed = confirmedEstimateId === estimateId;
  const canConfirm = estimateStatus === "SENT" && requestStatus === "OPEN";

  return {
    isConfirmed,
    canConfirm,
    confirmDisabledReason: getConfirmDisabledReason(estimateStatus, requestStatus, isConfirmed),
  };
}

export function assertConfirmableReceivedEstimate(params: {
  estimateStatus: EstimateStatus;
  requestStatus: EstimateRequestStatus;
  confirmedEstimateId: number | null;
}): void {
  if (params.requestStatus !== "OPEN") {
    throw new AppError("CONFLICT", {
      message: "확정할 수 없는 견적 요청 상태입니다.",
    });
  }

  if (params.confirmedEstimateId !== null) {
    throw new AppError("CONFLICT", {
      message: "이미 확정된 견적 요청입니다.",
    });
  }

  if (params.estimateStatus !== "SENT") {
    throw new AppError("CONFLICT", {
      message: "확정할 수 없는 견적 상태입니다.",
    });
  }
}
