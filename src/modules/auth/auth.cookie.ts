import type { CookieOptions } from "express";

/** 정지 이의 제기 제한 세션 Cookie 이름 및 유효 시간(15분). */
export const SUSPENSION_APPEAL_TOKEN_COOKIE = "suspensionAppealToken";
export const SUSPENSION_APPEAL_TOKEN_MAX_AGE = 15 * 60 * 1000;

/**
 * 제한 세션 토큰은 JavaScript와 일반 API에서 접근하지 못하도록
 * 문의 API 경로에만 HttpOnly Cookie로 전송한다.
 */
export const suspensionAppealTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/inquiries",
};
