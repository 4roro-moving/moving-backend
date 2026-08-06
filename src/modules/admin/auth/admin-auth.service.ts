import bcrypt from "bcrypt";
import { AuthProvider, RefreshTokenSessionType, UserRole } from "@prisma/client";

import { adminAuthRepository } from "./admin-auth.repository";
import { authRepository } from "../../auth/auth.repository";

import type { AdminAuthResponse, AdminRefreshResponse } from "./admin-auth.type";
import type { AdminLoginInput } from "./admin-auth.validator";

import { AppError } from "../../../lib/app-error";
import { createAccessToken, createRefreshToken, verifyRefreshToken } from "../../../utils/jwt";
import { tokenHash } from "../../../utils/tokenHash";
import { runTransaction } from "../../../utils/transaction";

/**
 * Access Token과 Refresh Token을 발급하고,
 * Refresh Token의 만료 시각을 계산한다.
 */
const createAdminAuthTokens = (
  userId: string,
  role: UserRole,
): AdminRefreshResponse & { refreshTokenExpiresAt: Date } => {
  const tokenPayload = {
    userId,
    role,
  };

  const accessToken = createAccessToken(tokenPayload);
  const refreshToken = createRefreshToken(tokenPayload);

  const refreshTokenPayload = verifyRefreshToken(refreshToken);

  if (!refreshTokenPayload.exp) {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "관리자 Refresh Token 만료 시간을 확인할 수 없습니다.",
    });
  }

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt: new Date(refreshTokenPayload.exp * 1000),
  };
};

/**
 * 관리자 로그인
 *
 * POST /api/admin/auth/login
 */
const login = async (input: AdminLoginInput): Promise<AdminAuthResponse> => {
  /*
   * Validator에서도 이메일을 정규화하지만,
   * Service를 직접 호출하는 경우까지 고려해 한 번 더 정규화한다.
   */
  const email = input.email.trim().toLowerCase();

  /*
   * 조회 결과는 아직 ADMIN 여부가 검증되지 않았으므로
   * admin이 아니라 user로 표현한다.
   */
  const user = await adminAuthRepository.findByEmailForLogin(email);

  /*
   * 존재하지 않는 이메일, 일반 사용자 계정,
   * OAuth 계정, 잘못된 비밀번호에는 동일한 메시지를 사용하여
   * 관리자 계정 존재 여부 노출을 줄인다.
   */
  if (!user) {
    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  /*
   * 일반 사용자 계정으로 관리자 로그인 API를 호출하더라도
   * 관리자 계정 여부가 드러나지 않도록 동일한 401 응답을 반환한다.
   */
  if (user.role !== UserRole.ADMIN) {
    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  /*
   * 비활성화되었거나 탈퇴 처리된 관리자는
   * 새로운 로그인 세션을 생성할 수 없다.
   *
   * 비활성 관리자 여부는 운영 정책상 구분하여 403으로 반환한다.
   */
  if (!user.isActive || user.deletedAt !== null) {
    throw new AppError("FORBIDDEN", {
      message: "비활성화되었거나 탈퇴 처리된 관리자 계정입니다.",
    });
  }

  /*
   * 관리자 로그인은 LOCAL 계정만 허용한다.
   *
   * OAuth 계정 여부가 노출되지 않도록
   * 잘못된 인증 정보와 동일한 응답을 반환한다.
   */
  if (user.authProvider !== AuthProvider.LOCAL || !user.password) {
    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  const isPasswordMatched = await bcrypt.compare(input.password, user.password);

  if (!isPasswordMatched) {
    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  const { accessToken, refreshToken, refreshTokenExpiresAt } = createAdminAuthTokens(
    user.id,
    user.role,
  );

  /*
   * 다중 로그인을 허용하므로 기존 세션을 덮어쓰지 않고
   * 새로운 관리자 로그인 세션을 추가한다.
   *
   * DB에는 Refresh Token 원문이 아니라
   * HMAC-SHA256 Hash만 저장한다.
   *
   * 관리자 인증에서 발급한 세션이므로
   * sessionType은 ADMIN으로 저장한다.
   */
  await authRepository.saveRefreshToken({
    userId: user.id,
    tokenHash: tokenHash(refreshToken),
    sessionType: RefreshTokenSessionType.ADMIN,
    expiresAt: refreshTokenExpiresAt,
  });

  return {
    admin: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  };
};

/**
 * 관리자 Access Token 및 Refresh Token 재발급
 *
 * POST /api/admin/auth/refresh
 *
 * Refresh Token Rotation을 적용한다.
 */
const refresh = async (currentRefreshToken: string): Promise<AdminRefreshResponse> => {
  let refreshTokenPayload;

  /*
   * Refresh Token의 서명과 만료 시간을 검증한다.
   */
  try {
    refreshTokenPayload = verifyRefreshToken(currentRefreshToken);
  } catch {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  const currentTokenHash = tokenHash(currentRefreshToken);

  /*
   * 관리자 인증에서 생성된 ADMIN 세션만 조회한다.
   *
   * 일반 사용자 Refresh Token이 관리자 Cookie에 전달되더라도
   * 관리자 Refresh 세션으로 사용할 수 없다.
   */
  const storedRefreshToken = await authRepository.findRefreshTokenByHash(
    currentTokenHash,
    RefreshTokenSessionType.ADMIN,
  );

  /*
   * JWT 자체가 유효하더라도 DB에 저장된 세션이 없다면
   * 서버가 발급한 유효한 관리자 세션으로 볼 수 없다.
   */
  if (!storedRefreshToken) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  /*
   * 이미 Rotation 또는 로그아웃으로 폐기된 토큰은
   * 다시 사용할 수 없다.
   */
  if (storedRefreshToken.revokedAt !== null) {
    throw new AppError("UNAUTHORIZED", {
      message: "이미 사용되었거나 폐기된 관리자 Refresh Token입니다.",
    });
  }

  /*
   * JWT exp 검증과 별도로
   * DB에 저장된 세션 만료 시각도 확인한다.
   */
  if (storedRefreshToken.expiresAt.getTime() <= Date.now()) {
    await authRepository.revokeRefreshTokenByHash(currentTokenHash, RefreshTokenSessionType.ADMIN);

    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  /*
   * JWT Payload의 사용자와
   * DB Refresh Token 세션의 소유자가 같은지 확인한다.
   */
  if (refreshTokenPayload.userId !== storedRefreshToken.userId) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  const admin = await adminAuthRepository.findByIdForSession(storedRefreshToken.userId);

  if (!admin) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  /*
   * 세션 유형뿐 아니라 실제 DB 사용자 Role도 다시 확인하여
   * 관리자 권한이 없는 사용자에게 관리자 Token을 발급하지 않는다.
   */
  if (admin.role !== UserRole.ADMIN) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  /*
   * 비활성화되었거나 탈퇴 처리된 관리자는
   * 기존 Refresh Token이 남아 있더라도 재발급할 수 없다.
   *
   * 비활성 상태가 확인되면 해당 관리자의
   * ADMIN 세션만 모두 폐기한다.
   *
   * 일반 사용자 인증 세션은 폐기 범위에 포함하지 않는다.
   */
  if (!admin.isActive || admin.deletedAt !== null) {
    await authRepository.revokeAllRefreshTokensByUserId(admin.id, RefreshTokenSessionType.ADMIN);

    throw new AppError("FORBIDDEN", {
      message: "비활성화된 관리자 계정입니다.",
    });
  }

  const { accessToken, refreshToken, refreshTokenExpiresAt } = createAdminAuthTokens(
    admin.id,
    admin.role,
  );

  /*
   * 기존 Refresh Token 폐기와 신규 Refresh Token 저장을
   * 하나의 트랜잭션으로 처리한다.
   *
   * 동일 Refresh Token으로 동시 재발급 요청이 들어오더라도
   * revoke 결과가 1건인 요청만 Rotation에 성공한다.
   *
   * 기존 세션 폐기와 신규 세션 저장 모두
   * ADMIN 세션 범위 안에서만 처리한다.
   */
  await runTransaction(async (tx) => {
    const revokeResult = await authRepository.revokeRefreshTokenByHash(
      currentTokenHash,
      RefreshTokenSessionType.ADMIN,
      tx,
    );

    if (revokeResult.count !== 1) {
      throw new AppError("UNAUTHORIZED", {
        message: "이미 사용되었거나 유효하지 않은 관리자 Refresh Token입니다.",
      });
    }

    await authRepository.saveRefreshToken(
      {
        userId: admin.id,
        tokenHash: tokenHash(refreshToken),
        sessionType: RefreshTokenSessionType.ADMIN,
        expiresAt: refreshTokenExpiresAt,
      },
      tx,
    );
  });

  return {
    accessToken,
    refreshToken,
  };
};

/**
 * 현재 관리자 로그인 세션 로그아웃
 *
 * POST /api/admin/auth/logout
 */
const logout = async (currentRefreshToken: string): Promise<void> => {
  const currentTokenHash = tokenHash(currentRefreshToken);

  /*
   * 로그아웃은 멱등성을 유지한다.
   *
   * 현재 Refresh Token에 해당하는 ADMIN 세션만 폐기하며,
   * 이미 폐기됐거나 존재하지 않는 토큰이어도 오류를 발생시키지 않는다.
   *
   * 일반 사용자 인증 세션은 관리자 로그아웃의
   * 폐기 범위에 포함하지 않는다.
   */
  await authRepository.revokeRefreshTokenByHash(currentTokenHash, RefreshTokenSessionType.ADMIN);
};

export const adminAuthService = {
  login,
  refresh,
  logout,
};
