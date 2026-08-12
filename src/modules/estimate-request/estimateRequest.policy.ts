import type { EstimateRequestStatus } from "@prisma/client";

import { AppError } from "../../lib/app-error";

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
  const [year, month, day] = moveDate.split("-").map(Number);
  const parsed = new Date(`${moveDate}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new AppError("INVALID_MOVE_DATE");
  }

  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * MS_PER_HOUR);
  const todayInKst = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()),
  );

  if (parsed.getTime() < todayInKst.getTime()) {
    throw new AppError("INVALID_MOVE_DATE");
  }

  return parsed;
}

export function resolveExpiresAt(moveDate: Date): Date {
  const now = Date.now();

  const dayBeforeMove = moveDate.getTime() - MS_PER_DAY;
  const defaultExpiration = now + DEFAULT_EXPIRATION_DAYS * MS_PER_DAY;
  const minimumExpiration = now + MIN_EXPIRATION_HOURS * MS_PER_HOUR;

  const candidate = Math.min(dayBeforeMove, defaultExpiration);

  return new Date(Math.max(candidate, minimumExpiration));
}
