import type { AuthProvider, UserRole } from "@prisma/client";

/*
 * Access Token과 Refresh Token 응답
 */
export interface AuthTokens {
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
 * 회원가입 및 로그인 성공 응답
 */
export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

/*
 * 인증 미들웨어가 Express Request에 저장하는 사용자 정보
 */
export interface RequestUser {
  id: string;
  role: UserRole;
}

/*
 * 외부 OAuth 공급자로부터 조회한 공통 사용자 정보
 *
 * Google 전용 응답 구조를 Service까지 전달하지 않고,
 * 서비스 내부에서 사용할 공통 형식으로 변환한다.
 */
export interface OAuthProfile {
  provider: Exclude<AuthProvider, "LOCAL">;
  providerUserId: string;
  email: string;
  name: string;
  emailVerified: boolean;
}
