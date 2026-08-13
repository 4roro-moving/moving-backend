import type { EstimateRequestStatus } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { isPastInKst, kstDayStart, parseDateMarker } from "../../utils/kst";

import {
  CANCELABLE_ESTIMATE_REQUEST_STATUSES,
  DEFAULT_EXPIRATION_DAYS,
  EDITABLE_STATUSES,
  MIN_EXPIRATION_HOURS,
  MS_PER_DAY,
  MS_PER_HOUR,
} from "./estimateRequest.constants";

export const CANCELABLE_STATUSES = CANCELABLE_ESTIMATE_REQUEST_STATUSES;

export function assertCancelable(request: {
  status: EstimateRequestStatus;
  isActive: boolean;
}): void {
  if (request.status === "CANCELED") {
    throw new AppError("ESTIMATE_REQUEST_ALREADY_CANCELED");
  }

  if (!request.isActive || !CANCELABLE_STATUSES.includes(request.status)) {
    throw new AppError("ESTIMATE_REQUEST_CANCEL_NOT_ALLOWED");
  }
}

export function assertEditable(request: { status: EstimateRequestStatus }, message?: string): void {
  if (!EDITABLE_STATUSES.includes(request.status)) {
    throw new AppError("REQUEST_NOT_EDITABLE", message ? { message } : {});
  }
}

export function assertRequestNotExpired(expiresAt: Date): void {
  if (expiresAt.getTime() <= Date.now()) {
    throw new AppError("REQUEST_NOT_EDITABLE", {
      message: "만료된 견적 요청입니다.",
    });
  }
}

export function resolveMoveDate(moveDate: string): Date {
  const parsed = parseDateMarker(moveDate);
  if (!parsed) {
    throw new AppError("INVALID_MOVE_DATE", {
      message: "이사 예정일 형식이 올바르지 않습니다.",
    });
  }
  if (isPastInKst(parsed)) {
    throw new AppError("INVALID_MOVE_DATE", {
      message: "이사 예정일은 오늘 이후로 선택해 주세요.",
    });
  }
  return parsed;
}

export function resolveExpiresAt(moveDate: Date): Date {
  const now = Date.now();
  const candidate = Math.min(
    kstDayStart(moveDate).getTime(),
    now + DEFAULT_EXPIRATION_DAYS * MS_PER_DAY,
  );
  return new Date(Math.max(candidate, now + MIN_EXPIRATION_HOURS * MS_PER_HOUR));
}
