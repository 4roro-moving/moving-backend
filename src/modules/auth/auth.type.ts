import type { UserRole } from "@prisma/client";

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  phone: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export interface LogoutInput {
  refreshToken: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface RequestUser {
  id: string;
  role: UserRole;
}
