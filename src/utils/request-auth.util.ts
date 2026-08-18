import type { Request } from "express";

import { AppError } from "../lib/app-error";
import type { AuthenticatedUser } from "../modules/auth/auth.type";

/**
 * 인증 미들웨어가 설정한 현재 사용자의 존재를 확인하고 타입을 좁힙니다.
 * 정상 반환 이후에는 req.user를 optional이 아닌 값으로 사용할 수 있습니다.
 */
export function assertAuthenticated(
  req: Request,
): asserts req is Request & { user: AuthenticatedUser } {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }
}

/** 인증된 현재 사용자의 ID를 반환합니다. */
export function getAuthenticatedUserId(req: Request): string {
  assertAuthenticated(req);
  return req.user.id;
}
