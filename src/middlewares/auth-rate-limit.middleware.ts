import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { AppError } from "../lib/app-error";

const WINDOW_MS = 15 * 60 * 1000;

const getNormalizedEmail = (req: Request): string => {
  const email = req.body?.email;

  if (typeof email !== "string") {
    return "unknown";
  }

  return email.trim().toLowerCase();
};

const getIpKey = (req: Request): string => {
  if (!req.ip) {
    return "unknown";
  }

  return ipKeyGenerator(req.ip);
};

const getIpAndEmailKey = (req: Request): string => {
  return `${getIpKey(req)}:${getNormalizedEmail(req)}`;
};

const commonOptions = {
  windowMs: WINDOW_MS,
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
};

/**
 * 일반 사용자 로그인 - IP 전체 제한
 *
 * 동일 IP에서 15분 동안
 * 실패한 로그인 요청을 최대 50회 허용한다.
 */
export const userLoginIpRateLimiter = rateLimit({
  ...commonOptions,
  limit: 50,
  keyGenerator: getIpKey,
  handler: (_req, _res, next) => {
    next(
      new AppError("TOO_MANY_REQUESTS", {
        message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
      }),
    );
  },
});

/**
 * 일반 사용자 로그인 - IP + Email 제한
 *
 * 동일 IP에서 동일 계정에 대해
 * 15분 동안 실패한 로그인 요청을 최대 10회 허용한다.
 */
export const userLoginAccountRateLimiter = rateLimit({
  ...commonOptions,
  limit: 10,
  keyGenerator: getIpAndEmailKey,
  handler: (_req, _res, next) => {
    next(
      new AppError("TOO_MANY_REQUESTS", {
        message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
      }),
    );
  },
});

/**
 * 관리자 로그인 - IP 전체 제한
 *
 * 동일 IP에서 15분 동안
 * 실패한 관리자 로그인 요청을 최대 20회 허용한다.
 */
export const adminLoginIpRateLimiter = rateLimit({
  ...commonOptions,
  limit: 20,
  keyGenerator: getIpKey,
  handler: (_req, _res, next) => {
    next(
      new AppError("TOO_MANY_REQUESTS", {
        message: "관리자 로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
      }),
    );
  },
});

/**
 * 관리자 로그인 - IP + Email 제한
 *
 * 동일 IP에서 동일 관리자 계정에 대해
 * 15분 동안 실패한 로그인 요청을 최대 5회 허용한다.
 */
export const adminLoginAccountRateLimiter = rateLimit({
  ...commonOptions,
  limit: 5,
  keyGenerator: getIpAndEmailKey,
  handler: (_req, _res, next) => {
    next(
      new AppError("TOO_MANY_REQUESTS", {
        message: "관리자 로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
      }),
    );
  },
});
