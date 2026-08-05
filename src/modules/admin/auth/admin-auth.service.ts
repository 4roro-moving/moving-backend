import bcrypt from "bcrypt";
import { AuthProvider, UserRole } from "@prisma/client";

import { adminAuthRepository } from "./admin-auth.repository";
import { authRepository } from "../../auth/auth.repository";

import type { AdminAuthResponse, AdminRefreshResponse, CurrentAdmin } from "./admin-auth.type";
import type { AdminLoginInput } from "./admin-auth.validator";

import { AppError } from "../../../lib/app-error";
import { createAccessToken, createRefreshToken, verifyRefreshToken } from "../../../utils/jwt";
import { tokenHash } from "../../../utils/tokenHash";
import { runTransaction } from "../../../utils/transaction";

/*
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

/*
 * 관리자 로그인
 *
 * POST /api/admin/auth/login
 */
const login = async (input: AdminLoginInput): Promise<AdminAuthResponse> => {
  /*
   * Validator에서도 이메일을 정규화하지만,
   * Service를 직접 호출하는 상황까지 고려해 한 번 더 정규화한다.
   */
  const email = input.email.trim().toLowerCase();

  const admin = await adminAuthRepository.findByEmail(email);

  /*
   * 존재하지 않는 계정과 잘못된 비밀번호는 동일한 메시지를 반환하여
   * 이메일 등록 여부 노출을 줄인다.
   */
  if (!admin) {
    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  /*
   * 일반 사용자 계정으로 관리자 로그인 API를
   * 이용하지 못하도록 관리자 Role을 먼저 검증한다.
   */
  if (admin.role !== UserRole.ADMIN) {
    throw new AppError("FORBIDDEN", {
      message: "관리자 권한이 없는 계정입니다.",
    });
  }

  /*
   * 비활성화되거나 탈퇴 처리된 관리자는
   * 새로운 로그인 세션을 생성할 수 없다.
   */
  if (!admin.isActive || admin.deletedAt !== null) {
    throw new AppError("FORBIDDEN", {
      message: "비활성화되었거나 탈퇴 처리된 관리자 계정입니다.",
    });
  }

  /*
   * 관리자 로그인은 LOCAL 계정만 허용한다.
   */
  if (admin.authProvider !== AuthProvider.LOCAL || !admin.password) {
    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  const isPasswordMatched = await bcrypt.compare(input.password, admin.password);

  if (!isPasswordMatched) {
    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  const { accessToken, refreshToken, refreshTokenExpiresAt } = createAdminAuthTokens(
    admin.id,
    admin.role,
  );

  /*
   * 다중 로그인을 허용하므로 기존 세션을 덮어쓰지 않고
   * 새로운 관리자 로그인 세션을 추가한다.
   *
   * DB에는 Refresh Token 원문이 아닌
   * HMAC-SHA256 Hash만 저장한다.
   */
  await authRepository.saveRefreshToken({
    userId: admin.id,
    tokenHash: tokenHash(refreshToken),
    expiresAt: refreshTokenExpiresAt,
  });

  return {
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      isActive: admin.isActive,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  };
};

/*
 * 관리자 Access Token 및 Refresh Token 재발급
 *
 * POST /api/admin/auth/refresh
 *
 * Refresh Token Rotation을 적용한다.
 */
const refresh = async (currentRefreshToken: string): Promise<AdminRefreshResponse> => {
  let refreshTokenPayload;

  try {
    refreshTokenPayload = verifyRefreshToken(currentRefreshToken);
  } catch {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  const currentTokenHash = tokenHash(currentRefreshToken);

  const storedRefreshToken = await authRepository.findRefreshTokenByHash(currentTokenHash);

  /*
   * JWT가 유효하더라도 DB에 저장된 세션이 없으면
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
   * JWT exp 외에도 DB에 저장된 만료 시각을 확인한다.
   */
  if (storedRefreshToken.expiresAt.getTime() <= Date.now()) {
    await authRepository.revokeRefreshTokenByHash(currentTokenHash);

    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  /*
   * JWT Payload의 사용자와 DB 세션 소유자가 같은지 확인한다.
   */
  if (refreshTokenPayload.userId !== storedRefreshToken.userId) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  const admin = await adminAuthRepository.findById(storedRefreshToken.userId);

  if (!admin) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  /*
   * 일반 사용자의 Refresh Token이 관리자 전용 Cookie에
   * 잘못 전달되더라도 관리자 토큰을 발급하지 않는다.
   */
  if (admin.role !== UserRole.ADMIN) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  /*
   * 비활성화되거나 탈퇴 처리된 관리자는
   * 기존 Refresh Token이 남아 있어도 재발급할 수 없다.
   */
  if (!admin.isActive || admin.deletedAt !== null) {
    await authRepository.revokeAllRefreshTokensByUserId(admin.id);

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
   * 동일한 Refresh Token으로 재발급 요청이 동시에 들어오면
   * revoke 결과가 1건인 요청만 성공한다.
   */
  await runTransaction(async (tx) => {
    const revokeResult = await authRepository.revokeRefreshTokenByHash(currentTokenHash, tx);

    if (revokeResult.count !== 1) {
      throw new AppError("UNAUTHORIZED", {
        message: "이미 사용되었거나 유효하지 않은 관리자 Refresh Token입니다.",
      });
    }

    await authRepository.saveRefreshToken(
      {
        userId: admin.id,
        tokenHash: tokenHash(refreshToken),
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

/*
 * 현재 관리자 로그인 세션 로그아웃
 *
 * POST /api/admin/auth/logout
 */
const logout = async (currentRefreshToken: string): Promise<void> => {
  const currentTokenHash = tokenHash(currentRefreshToken);

  /*
   * 로그아웃은 멱등성을 유지한다.
   *
   * 토큰이 이미 폐기됐거나 DB에 존재하지 않더라도
   * 오류를 발생시키지 않고 정상 처리한다.
   */
  await authRepository.revokeRefreshTokenByHash(currentTokenHash);
};

/*
 * 현재 로그인한 관리자 정보 조회
 *
 * GET /api/admin/auth/me
 */
const getCurrentAdmin = async (adminId: string): Promise<CurrentAdmin> => {
  const admin = await adminAuthRepository.findById(adminId);

  if (!admin) {
    throw new AppError("UNAUTHORIZED", {
      message: "관리자 계정을 확인할 수 없습니다.",
    });
  }

  if (admin.role !== UserRole.ADMIN) {
    throw new AppError("FORBIDDEN", {
      message: "관리자 권한이 없는 계정입니다.",
    });
  }

  /*
   * Access Token이 아직 만료되지 않았더라도
   * DB의 활성 상태를 확인해 비활성 관리자를 즉시 차단한다.
   */
  if (!admin.isActive || admin.deletedAt !== null) {
    throw new AppError("FORBIDDEN", {
      message: "비활성화된 관리자 계정입니다.",
    });
  }

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    isActive: admin.isActive,
    createdAt: admin.createdAt,
  };
};

export const adminAuthService = {
  login,
  refresh,
  logout,
  getCurrentAdmin,
};
