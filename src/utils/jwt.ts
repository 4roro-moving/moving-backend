import { randomUUID } from "node:crypto";

import type { UserRole } from "@prisma/client";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

import { AppError } from "../lib/app-error";

export type TokenPayload = {
  userId: string;
  role: UserRole;
};

export type VerifiedTokenPayload = TokenPayload & JwtPayload;

type TokenExpiresIn = NonNullable<SignOptions["expiresIn"]>;

const getJwtSecret = (): string => {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "JWT_SECRET environment variable is not set",
    });
  }

  return jwtSecret;
};

const getRefreshSecret = (): string => {
  const refreshSecret = process.env.REFRESH_SECRET;

  if (!refreshSecret) {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "REFRESH_SECRET environment variable is not set",
    });
  }

  return refreshSecret;
};

const getAccessTokenExpiresIn = (): TokenExpiresIn => {
  const expiresIn = process.env.ACCESS_TOKEN_EXPIRES_IN;

  if (!expiresIn) {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "ACCESS_TOKEN_EXPIRES_IN environment variable is not set",
    });
  }

  return expiresIn as TokenExpiresIn;
};

const getRefreshTokenExpiresIn = (): TokenExpiresIn => {
  const expiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN;

  if (!expiresIn) {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "REFRESH_TOKEN_EXPIRES_IN environment variable is not set",
    });
  }

  return expiresIn as TokenExpiresIn;
};

const isTokenPayload = (payload: string | JwtPayload): payload is VerifiedTokenPayload => {
  return (
    typeof payload !== "string" &&
    typeof payload.userId === "string" &&
    typeof payload.role === "string"
  );
};

export const createAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getAccessTokenExpiresIn(),
  });
};

export const createRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: getRefreshTokenExpiresIn(),
    jwtid: randomUUID(),
  });
};

export const verifyAccessToken = (token: string): VerifiedTokenPayload => {
  try {
    const payload = jwt.verify(token, getJwtSecret());

    if (!isTokenPayload(payload)) {
      throw new AppError("UNAUTHORIZED", {
        message: "유효하지 않은 Access Token입니다.",
      });
    }

    return payload;
  } catch {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않은 Access Token입니다.",
    });
  }
};

/**
 * optionalAuthenticate 전용.
 * 만료와 위조/형식 오류를 구분해, 만료만 비회원 통과시킬 수 있게 한다.
 * verifyAccessToken(필수 인증) 동작은 건드리지 않는다.
 */
export type OptionalAccessTokenResult =
  | { status: "authenticated"; payload: VerifiedTokenPayload }
  | { status: "expired" }
  | { status: "invalid" };

export const verifyAccessTokenOptional = (token: string): OptionalAccessTokenResult => {
  try {
    const payload = jwt.verify(token, getJwtSecret());

    if (!isTokenPayload(payload)) {
      return { status: "invalid" };
    }

    return { status: "authenticated", payload };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { status: "expired" };
    }

    return { status: "invalid" };
  }
};

export const verifyRefreshToken = (token: string): VerifiedTokenPayload => {
  try {
    const payload = jwt.verify(token, getRefreshSecret());

    if (!isTokenPayload(payload)) {
      throw new AppError("UNAUTHORIZED", {
        message: "유효하지 않은 Refresh Token입니다.",
      });
    }

    return payload;
  } catch {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않은 Refresh Token입니다.",
    });
  }
};
