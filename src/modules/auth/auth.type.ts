import type { AuthProvider, UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

/*
 * 클라이언트 응답으로 반환하는 토큰 정보
 *
 * Refresh Token은 HttpOnly Cookie로 전달하므로
 * 응답 Body에는 Access Token만 포함한다.
 */
export interface AuthTokens {
  accessToken: string;
}

/*
 * Service에서 Controller로 전달하는 발급 토큰 정보
 *
 * Controller는 Refresh Token을 HttpOnly Cookie로 설정한 뒤
 * 응답 Body에서는 제외한다.
 */
export interface IssuedAuthTokens {
  accessToken: string;
  refreshToken: string;
}

/*
 * 인증 성공 시 클라이언트에 반환하는 사용자 정보
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
}

/*
 * 회원가입 및 로그인 Service 결과
 *
 * Controller에서 Refresh Token을 Cookie로 설정하기 위해
 * 내부적으로 Access Token과 Refresh Token을 모두 전달한다.
 */
export interface AuthResponse {
  user: AuthUser;
  tokens: IssuedAuthTokens;
}

/*
 * Refresh Token 재발급 Service 결과
 *
 * Rotation으로 발급된 새 Refresh Token을 Controller에 전달하고,
 * Controller는 Access Token만 응답 Body에 포함한다.
 */
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/*
 * 외부 OAuth 공급자로부터 조회한 공통 사용자 정보
 *
 * Provider별 사용자 정보 응답을 공통 형식으로 변환하여
 * 인증 Service에서 사용한다.
 */
export interface OAuthProfile {
  provider: Exclude<AuthProvider, "LOCAL">;
  providerUserId: string;
  email: string;
  name: string;
  emailVerified: boolean;
}
