import type { AdminRole, UserRole } from "@prisma/client";

/**
 * 관리자 인증 응답에 포함되는 관리자 정보
 *
 * role은 User.role(ADMIN)이고,
 * adminRole은 AdminProfile.adminRole을 평탄화한 값.
 */
export interface AdminAuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  adminRole: AdminRole | null;
}

/**
 * 관리자 로그인 시 발급되는 토큰
 *
 * Access Token은 응답 Body로 전달하고,
 * Refresh Token은 Controller에서 HttpOnly Cookie로 저장한다.
 */
export interface AdminAuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * 관리자 로그인 Service 반환 타입
 */
export interface AdminAuthResponse {
  admin: AdminAuthUser;
  tokens: AdminAuthTokens;
}

/**
 * 관리자 Access Token 재발급 Service 반환 타입
 */
export interface AdminRefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * 현재 로그인한 관리자 정보 조회 응답 타입
 */
export interface CurrentAdmin {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  adminRole: AdminRole | null;
}
