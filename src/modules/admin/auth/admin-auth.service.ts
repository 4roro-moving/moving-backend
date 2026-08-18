import { randomUUID } from "node:crypto";

import bcrypt from "bcrypt";
import {
  AuthProvider,
  RefreshTokenRevokedReason,
  RefreshTokenSessionType,
  UserRole,
} from "@prisma/client";

import { adminAuthRepository } from "./admin-auth.repository";
import { authRepository } from "../../auth/auth.repository";

import type { AdminAuthResponse, AdminRefreshResponse } from "./admin-auth.type";
import type { AdminLoginInput } from "./admin-auth.validator";

import { AppError } from "../../../lib/app-error";
import { createAccessToken, createRefreshToken, verifyRefreshToken } from "../../../utils/jwt";
import { runRefreshTokenSingleFlight } from "../../../utils/refresh-token-single-flight";
import {
  handleRefreshTokenFamilyReuseDetection,
  runRefreshTokenFamilyRotation,
} from "../../../utils/refresh-token-family-coordination";
import { tokenHash } from "../../../utils/tokenHash";
import { runTransaction } from "../../../utils/transaction";

const DUMMY_PASSWORD_HASH = "$2b$10$CxtIUUg2JDRWy.TYdu0y0e9bahGlNcJg2F78GaW9lRboxNL/OZpE6";

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
  /**
   * Validator에서도 이메일을 정규화하지만,
   * Service를 직접 호출하는 경우까지 고려해 한 번 더 정규화한다.
   */
  const email = input.email.trim().toLowerCase();

  /**
   * 조회 결과는 아직 ADMIN 여부가 검증되지 않았으므로
   * admin이 아니라 user로 표현한다.
   */
  const user = await adminAuthRepository.findByEmailForLogin(email);

  /**
   * 존재하지 않는 이메일도 실제 비밀번호 검증과 유사한
   * bcrypt 연산 비용을 발생시키도록 Dummy Hash를 비교한다.
   *
   * 존재하지 않는 계정과 잘못된 비밀번호 요청 사이의
   * 응답 시간 차이를 완화하여 계정 존재 여부 추측을 어렵게 한다.
   */
  if (!user) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);

    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  /**
   * 일반 사용자 계정으로 관리자 로그인 API를 호출하더라도
   * 관리자 계정 여부가 드러나지 않도록 동일한 401을 반환한다.
   *
   * 이 경우에도 Dummy Hash 비교를 수행하여
   * 실제 관리자 비밀번호 검증과의 Timing 차이를 완화한다.
   */
  if (user.role !== UserRole.ADMIN) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);

    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  /**
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

  /**
   * 관리자 로그인은 LOCAL 계정만 허용한다.
   *
   * OAuth 계정 여부가 노출되지 않도록
   * 잘못된 인증 정보와 동일한 응답을 반환한다.
   *
   * bcrypt 연산 여부에 따른 Timing 차이를 줄이기 위해
   * Dummy Hash를 대상으로 비교 연산을 수행한다.
   */
  if (user.authProvider !== AuthProvider.LOCAL || !user.password) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);

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

  /**
   * 로그인 1회를 하나의 Token Family로 관리한다.
   *
   * 새로운 관리자 로그인 세션마다 새로운 familyId를 생성하며,
   * 이후 Refresh Token Rotation에서는 동일한 familyId를 계승한다.
   *
   * 다중 로그인을 허용하므로 다른 로그인 세션은
   * 서로 다른 Token Family를 가진다.
   */
  const familyId = randomUUID();

  /**
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
    familyId,
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
 * 실제 관리자 Access Token 및 Refresh Token 재발급 작업을 수행한다.
 *
 * Refresh Token Rotation을 적용하며,
 * 기존 Refresh Token은 물리적으로 삭제하지 않고
 * revokedAt을 기록하여 사용 불가능한 상태로 변경한다.
 *
 * 기존 토큰 revoke와 신규 토큰 저장은
 * 하나의 트랜잭션으로 처리한다.
 *
 * 이 함수는 SingleFlight 내부에서 실행되므로,
 * 동일 관리자 Refresh Token으로 동시에 요청이 들어온 경우
 * 하나의 요청만 이 로직을 실제로 수행한다.
 */
const executeAdminRefresh = async (
  currentRefreshToken: string,
  currentTokenHash: string,
): Promise<AdminRefreshResponse> => {
  let refreshTokenPayload;

  /**
   * Refresh Token의 서명과 만료 시간을 검증한다.
   */
  try {
    refreshTokenPayload = verifyRefreshToken(currentRefreshToken);
  } catch {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  /**
   * 관리자 인증에서 생성된 ADMIN 세션만 조회한다.
   *
   * 일반 사용자 Refresh Token이 관리자 Cookie에 전달되더라도
   * 관리자 Refresh 세션으로 사용할 수 없다.
   */
  const storedRefreshToken = await authRepository.findRefreshTokenByHash(
    currentTokenHash,
    RefreshTokenSessionType.ADMIN,
  );

  /**
   * JWT 자체가 유효하더라도 DB에 저장된 세션이 없다면
   * 서버가 발급한 유효한 관리자 세션으로 볼 수 없다.
   */
  if (!storedRefreshToken) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  /**
   * Rotation으로 이미 폐기된 Refresh Token이 다시 사용되고,
   * Token Family 정보가 존재하는 경우 Refresh Token Reuse로 판단한다.
   *
   * 재사용이 감지되면 사용자의 다른 관리자 로그인 세션에는
   * 영향을 주지 않고 동일 Token Family의 활성 ADMIN 세션만 폐기한다.
   *
   * 마이그레이션 이전 Refresh Token은 familyId가 null일 수 있으므로
   * Family 기반 Reuse Detection을 적용하지 않는다.
   */
  if (
    storedRefreshToken.revokedAt !== null &&
    storedRefreshToken.revokedReason === RefreshTokenRevokedReason.ROTATED &&
    storedRefreshToken.familyId !== null
  ) {
    await handleRefreshTokenFamilyReuseDetection(
      RefreshTokenSessionType.ADMIN,
      storedRefreshToken.familyId,
      () =>
        authRepository.revokeRefreshTokenFamily(
          storedRefreshToken.familyId!,
          RefreshTokenSessionType.ADMIN,
          RefreshTokenRevokedReason.REUSE_DETECTED,
        ),
    );

    /**
     * Refresh Token 재사용 탐지 여부는 외부에 상세하게 노출하지 않고
     * 일반적인 인증 실패와 동일하게 401로 처리한다.
     */
    throw new AppError("UNAUTHORIZED", {
      message: "이미 사용되었거나 폐기된 관리자 Refresh Token입니다.",
    });
  }

  /**
   * 로그아웃, 강제 폐기, 만료 등의 이유로 이미 폐기된 토큰은
   * Reuse Detection 대상으로 처리하지 않고 일반 인증 실패로 처리한다.
   */
  if (storedRefreshToken.revokedAt !== null) {
    throw new AppError("UNAUTHORIZED", {
      message: "이미 사용되었거나 폐기된 관리자 Refresh Token입니다.",
    });
  }

  /**
   * JWT exp 검증과 별도로
   * DB에 저장된 세션 만료 시각도 확인한다.
   */
  if (storedRefreshToken.expiresAt.getTime() <= Date.now()) {
    await authRepository.revokeRefreshTokenByHash(
      currentTokenHash,
      RefreshTokenSessionType.ADMIN,
      RefreshTokenRevokedReason.EXPIRED,
    );

    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  /**
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

  /**
   * 세션 유형뿐 아니라 실제 DB 사용자 Role도 다시 확인하여
   * 관리자 권한이 없는 사용자에게 관리자 Token을 발급하지 않는다.
   */
  if (admin.role !== UserRole.ADMIN) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 관리자 Refresh Token입니다.",
    });
  }

  /**
   * 비활성화되었거나 탈퇴 처리된 관리자는
   * 기존 Refresh Token이 남아 있더라도 재발급할 수 없다.
   *
   * 비활성 상태가 확인되면 해당 관리자의
   * ADMIN 세션만 모두 폐기한다.
   *
   * 일반 사용자 인증 세션은 폐기 범위에 포함하지 않는다.
   */
  if (!admin.isActive || admin.deletedAt !== null) {
    await authRepository.revokeAllRefreshTokensByUserId(
      admin.id,
      RefreshTokenSessionType.ADMIN,
      RefreshTokenRevokedReason.FORCED,
    );

    throw new AppError("FORBIDDEN", {
      message: "비활성화된 관리자 계정입니다.",
    });
  }

  const { accessToken, refreshToken, refreshTokenExpiresAt } = createAdminAuthTokens(
    admin.id,
    admin.role,
  );

  const performRotation = async (): Promise<AdminRefreshResponse> => {
    /**
     * 기존 Refresh Token 폐기와 신규 Refresh Token 저장을
     * 하나의 트랜잭션으로 처리한다.
     *
     * 기존 Refresh Token은 ROTATED 사유로 폐기하고,
     * 새 Refresh Token은 기존 Token Family의 familyId를 그대로 계승한다.
     *
     * 기존 마이그레이션 이전 Token은 familyId가 null일 수 있으며,
     * 이 경우 임의로 새로운 Family를 생성하지 않고 null을 그대로 계승한다.
     *
     * SingleFlight가 정상적인 동시 요청의 중복 실행을 방지하고,
     * revoke 결과 count 조건은 최종적인 DB 수준의 방어선 역할을 한다.
     *
     * 기존 세션 폐기와 신규 세션 저장 모두
     * ADMIN 세션 범위 안에서만 처리한다.
     */
    await runTransaction(async (tx) => {
      const revokeResult = await authRepository.revokeRefreshTokenByHash(
        currentTokenHash,
        RefreshTokenSessionType.ADMIN,
        RefreshTokenRevokedReason.ROTATED,
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
          familyId: storedRefreshToken.familyId,
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

  if (storedRefreshToken.familyId !== null) {
    return runRefreshTokenFamilyRotation(
      RefreshTokenSessionType.ADMIN,
      storedRefreshToken.familyId,
      performRotation,
      (issuedRefreshTokenHash) =>
        authRepository.revokeRefreshTokenByHash(
          issuedRefreshTokenHash,
          RefreshTokenSessionType.ADMIN,
          RefreshTokenRevokedReason.REUSE_DETECTED,
        ),
    );
  }

  return performRotation();
};

/**
 * 관리자 Access Token 및 Refresh Token 재발급
 *
 * POST /api/admin/auth/refresh
 *
 * 동일한 관리자 Refresh Token으로 동시에 여러 요청이 들어오면
 * SingleFlight를 통해 하나의 Refresh 작업만 실행한다.
 *
 * 먼저 들어온 요청이 처리 중이라면 이후 요청은
 * 새로운 Rotation을 실행하지 않고 동일한 Promise 결과를 공유한다.
 *
 * 따라서 정상적인 동시 Refresh 요청이
 * Rotation된 Refresh Token의 재사용으로 오탐되는 것을 방지한다.
 *
 * Rotation이 완전히 끝난 이후 이전 Refresh Token이 다시 사용되는 경우에는
 * SingleFlight 대상이 아니며 executeAdminRefresh 내부의
 * Token Family 기반 Reuse Detection이 처리한다.
 *
 * 현재 SingleFlight 저장소는 프로세스 메모리를 사용하므로
 * 단일 Node.js 프로세스를 전제로 한다.
 */
const refresh = async (currentRefreshToken: string): Promise<AdminRefreshResponse> => {
  /**
   * Refresh Token 원문을 SingleFlight Key로 사용하지 않는다.
   *
   * 기존 인증 정책과 동일한 HMAC-SHA256 Hash를 사용하여
   * 메모리에 Refresh Token 원문이 저장되는 것을 방지한다.
   */
  const currentTokenHash = tokenHash(currentRefreshToken);

  return runRefreshTokenSingleFlight(RefreshTokenSessionType.ADMIN, currentTokenHash, () =>
    executeAdminRefresh(currentRefreshToken, currentTokenHash),
  );
};

/**
 * 현재 관리자 로그인 세션 로그아웃
 *
 * POST /api/admin/auth/logout
 */
const logout = async (currentRefreshToken: string): Promise<void> => {
  const currentTokenHash = tokenHash(currentRefreshToken);

  /**
   * 로그아웃은 멱등성을 유지한다.
   *
   * 현재 Refresh Token에 해당하는 ADMIN 세션만 폐기하며,
   * 이미 폐기됐거나 존재하지 않는 토큰이어도 오류를 발생시키지 않는다.
   *
   * 일반 사용자 인증 세션은 관리자 로그아웃의
   * 폐기 범위에 포함하지 않는다.
   */
  await authRepository.revokeRefreshTokenByHash(
    currentTokenHash,
    RefreshTokenSessionType.ADMIN,
    RefreshTokenRevokedReason.LOGOUT,
  );
};

export const adminAuthService = {
  login,
  refresh,
  logout,
};
