import type { UserRole } from "@prisma/client";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

import { ApiError } from "./ApiError";

export type TokenPayload = {
  userId: string;
  role: UserRole;
};

export type VerifiedTokenPayload = TokenPayload & JwtPayload;

type TokenExpiresIn = NonNullable<SignOptions["expiresIn"]>;

const getJwtSecret = (): string => {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new ApiError("INTERNAL_SERVER_ERROR", {
      message: "JWT_SECRET environment variable is not set",
    });
  }

  return jwtSecret;
};

const getRefreshSecret = (): string => {
  const refreshSecret = process.env.REFRESH_SECRET;

  if (!refreshSecret) {
    throw new ApiError("INTERNAL_SERVER_ERROR", {
      message: "REFRESH_SECRET environment variable is not set",
    });
  }

  return refreshSecret;
};

const getAccessTokenExpiresIn = (): TokenExpiresIn => {
  const expiresIn = process.env.ACCESS_TOKEN_EXPIRES_IN;

  if (!expiresIn) {
    throw new ApiError("INTERNAL_SERVER_ERROR", {
      message: "ACCESS_TOKEN_EXPIRES_IN environment variable is not set",
    });
  }

  return expiresIn as TokenExpiresIn;
};

const getRefreshTokenExpiresIn = (): TokenExpiresIn => {
  const expiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN;

  if (!expiresIn) {
    throw new ApiError("INTERNAL_SERVER_ERROR", {
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
  });
};

export const verifyAccessToken = (token: string): VerifiedTokenPayload => {
  try {
    const payload = jwt.verify(token, getJwtSecret());

    if (!isTokenPayload(payload)) {
      throw new ApiError("UNAUTHORIZED", {
        message: "유효하지 않은 Access Token입니다.",
      });
    }

    return payload;
  } catch {
    throw new ApiError("UNAUTHORIZED", {
      message: "유효하지 않은 Access Token입니다.",
    });
  }
};

export const verifyRefreshToken = (token: string): VerifiedTokenPayload => {
  try {
    const payload = jwt.verify(token, getRefreshSecret());

    if (!isTokenPayload(payload)) {
      throw new ApiError("UNAUTHORIZED", {
        message: "유효하지 않은 Refresh Token입니다.",
      });
    }

    return payload;
  } catch {
    throw new ApiError("UNAUTHORIZED", {
      message: "유효하지 않은 Refresh Token입니다.",
    });
  }
};
