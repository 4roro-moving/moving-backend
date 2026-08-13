import type { EstimateRequestStatus, EstimateStatus, MoveType } from "@prisma/client";

import { AppError } from "../../../lib/app-error";

export function getMoverMoveTypes(
  serviceMoveTypes: MoveType[],
  requestedMoveTypes: MoveType[] | undefined,
) {
  if (!requestedMoveTypes) {
    return serviceMoveTypes;
  }

  return serviceMoveTypes.filter((moveType) => requestedMoveTypes.includes(moveType));
}

export function assertEstimateRequestActionAllowed(
  request: {
    status: EstimateRequestStatus;
    isActive: boolean;
    confirmedEstimateId: number | null;
    expiresAt: Date;
  },
  unavailableMessage: string,
): void {
  if (request.status !== "OPEN" || !request.isActive || request.confirmedEstimateId !== null) {
    throw new AppError("CONFLICT", {
      message: unavailableMessage,
    });
  }

  if (request.expiresAt.getTime() <= Date.now()) {
    throw new AppError("CONFLICT", {
      message: "만료된 견적 요청입니다.",
    });
  }
}

export function assertMoverCanHandleMoveType(
  serviceMoveTypes: MoveType[],
  requestMoveType: MoveType,
): void {
  if (!serviceMoveTypes.includes(requestMoveType)) {
    throw new AppError("FORBIDDEN", {
      message: "서비스할 수 없는 이사 유형입니다.",
    });
  }
}

export function assertNoExistingMoverResponse(params: {
  sentEstimateCount: number;
  rejectionCount: number;
}): void {
  if (params.sentEstimateCount > 0) {
    throw new AppError("CONFLICT", {
      message: "이미 견적을 보낸 요청입니다.",
    });
  }

  if (params.rejectionCount > 0) {
    throw new AppError("CONFLICT", {
      message: "이미 반려한 견적 요청입니다.",
    });
  }
}

export function getSentEstimateDisplayStatus(
  estimateStatus: EstimateStatus,
  requestStatus: EstimateRequestStatus,
) {
  if (requestStatus === "COMPLETED") {
    return "COMPLETED" as const;
  }

  if (estimateStatus === "CONFIRMED") {
    return "CONFIRMED" as const;
  }

  return "SENT" as const;
}
