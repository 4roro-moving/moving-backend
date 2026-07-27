import bcrypt from "bcrypt";
import { AuthProvider, Prisma, UserRole } from "@prisma/client";

import { authRepository } from "./auth.repository";
import { googleOAuth } from "./oauth/google.oauth";
import { kakaoOAuth } from "./oauth/kakao.oauth";

import type { AuthResponse, AuthTokens, OAuthProfile } from "./auth.type";

import type {
  GoogleOAuthInput,
  KakaoOAuthInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  SignUpInput,
} from "./auth.validator";

import { AppError } from "../../lib/app-error";

import { createAccessToken, createRefreshToken, verifyRefreshToken } from "../../utils/jwt";

import { tokenHash } from "../../utils/tokenHash";
import { runTransaction } from "../../utils/transaction";

const PASSWORD_SALT_ROUNDS = 10;

type SignUpRole = typeof UserRole.CUSTOMER | typeof UserRole.MOVER;

/*
 * Prisma P2002 UNIQUE 제약조건 에러인지 확인하고,
 * 어떤 필드에서 발생했는지 판별한다.
 *
 * 회원가입 전 중복 조회는 빠른 응답을 위한 처리이며,
 * 실제 동시 가입 요청을 막는 것은 DB의 UNIQUE 제약조건이다.
 */
const isUniqueConstraintError = (
  error: unknown,
  fieldName: string,
): error is Prisma.PrismaClientKnownRequestError => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  const normalizedFieldName = fieldName.toLowerCase();

  if (Array.isArray(target)) {
    return target.some((field) => String(field).toLowerCase() === normalizedFieldName);
  }

  return String(target).toLowerCase().includes(normalizedFieldName);
};

/*
 * Access Token과 Refresh Token을 발급하고,
 * Refresh Token의 만료 시간을 계산한다.
 */
const createAuthTokens = (
  userId: string,
  role: UserRole,
): AuthTokens & { refreshTokenExpiresAt: Date } => {
  const tokenPayload = {
    userId,
    role,
  };

  const accessToken = createAccessToken(tokenPayload);
  const refreshToken = createRefreshToken(tokenPayload);

  const refreshTokenPayload = verifyRefreshToken(refreshToken);

  if (!refreshTokenPayload.exp) {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "Refresh Token 만료 시간을 확인할 수 없습니다.",
    });
  }

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt: new Date(refreshTokenPayload.exp * 1000),
  };
};

/*
 * 고객과 기사 회원가입에서 사용하는 내부 공통 함수.
 *
 * 외부에 공개하지 않으므로 ADMIN 역할을 전달해
 * 일반 회원가입을 진행할 수 없다.
 */
const createLocalUser = async (input: SignUpInput, role: SignUpRole): Promise<AuthResponse> => {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  /*
   * 전화번호의 공백과 하이픈을 제거하여
   * 동일한 전화번호가 서로 다른 형식으로 저장되는 것을 방지한다.
   *
   * 예:
   * 010-1234-5678 → 01012345678
   */
  const phone = input.phone.replace(/[\s-]/g, "");

  const { password } = input;

  /*
   * 빠른 이메일 중복 응답을 위한 사전 조회.
   *
   * 이 검사만으로는 동시 요청을 완전히 막을 수 없으므로
   * DB UNIQUE 제약조건과 P2002 처리도 함께 사용한다.
   */
  const existingUser = await authRepository.findByEmail(email);

  if (existingUser) {
    throw new AppError("CONFLICT", {
      message: "이미 사용 중인 이메일입니다.",
    });
  }

  /*
   * bcrypt 연산은 트랜잭션 밖에서 처리한다.
   * DB 트랜잭션이 커넥션을 점유하는 시간을 줄이기 위함이다.
   */
  const hashedPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

  try {
    return await runTransaction(async (tx) => {
      const user = await authRepository.create(
        {
          email,
          password: hashedPassword,
          name,
          phone,
          role,
          authProvider: AuthProvider.LOCAL,
        },
        tx,
      );

      const { accessToken, refreshToken, refreshTokenExpiresAt } = createAuthTokens(
        user.id,
        user.role,
      );

      await authRepository.saveRefreshToken(
        {
          userId: user.id,
          tokenHash: tokenHash(refreshToken),
          expiresAt: refreshTokenExpiresAt,
        },
        tx,
      );

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      };
    });
  } catch (error) {
    /*
     * 동일 이메일 회원가입 요청이 동시에 들어온 경우
     * DB UNIQUE 제약조건에 의해 하나만 성공한다.
     */
    if (isUniqueConstraintError(error, "email")) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 이메일입니다.",
      });
    }

    /*
     * 전화번호가 UNIQUE로 설정되어 있으므로
     * 중복 전화번호 회원가입 요청을 처리한다.
     */
    if (isUniqueConstraintError(error, "phone")) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
      });
    }

    throw error;
  }
};

/*
 * 고객 회원가입
 */
const signUpCustomer = async (input: SignUpInput): Promise<AuthResponse> => {
  return createLocalUser(input, UserRole.CUSTOMER);
};

/*
 * 기사 회원가입
 */
const signUpMover = async (input: SignUpInput): Promise<AuthResponse> => {
  return createLocalUser(input, UserRole.MOVER);
};

/*
 * 로컬 로그인
 */
const login = async (input: LoginInput): Promise<AuthResponse> => {
  /*
   * 회원가입과 동일한 방식으로 이메일을 정규화한다.
   */
  const email = input.email.trim().toLowerCase();

  const user = await authRepository.findByEmail(email);

  /*
   * 존재하지 않는 이메일과 잘못된 비밀번호에
   * 동일한 메시지를 사용하여 계정 존재 여부 노출을 줄인다.
   */
  if (!user) {
    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  /*
   * 비활성화되었거나 탈퇴 처리된 사용자는
   * 새로운 로그인 세션을 생성할 수 없다.
   */
  if (!user.isActive || user.deletedAt !== null) {
    throw new AppError("FORBIDDEN", {
      message: "비활성화되었거나 탈퇴 처리된 계정입니다.",
    });
  }

  /*
   * OAuth로 가입한 사용자는 로컬 비밀번호 로그인을
   * 사용할 수 없도록 막는다.
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

  const { accessToken, refreshToken, refreshTokenExpiresAt } = createAuthTokens(user.id, user.role);

  /*
   * 다중 로그인을 허용하므로 기존 Refresh Token을
   * 덮어쓰지 않고 새로운 로그인 세션을 추가한다.
   *
   * DB에는 Refresh Token 원문이 아니라
   * HMAC-SHA256 해시값만 저장한다.
   */
  await authRepository.saveRefreshToken({
    userId: user.id,
    tokenHash: tokenHash(refreshToken),
    expiresAt: refreshTokenExpiresAt,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  };
};

/*
 * OAuth 로그인 공통 처리
 *
 * provider와 providerUserId가 일치하는 사용자가 있으면 로그인하고,
 * 없으면 이메일 중복 여부를 확인한 뒤 신규 OAuth 사용자를 생성한다.
 */
const loginWithOAuth = async (
  profile: OAuthProfile,
  requestedRole: SignUpRole,
): Promise<AuthResponse> => {
  const existingOAuthUser = await authRepository.findByProviderAndProviderId(
    profile.provider,
    profile.providerUserId,
  );

  /*
   * 이미 OAuth 계정이 존재하는 경우
   * 요청으로 전달받은 role은 무시하고 DB에 저장된 role을 사용한다.
   */
  if (existingOAuthUser) {
    if (!existingOAuthUser.isActive || existingOAuthUser.deletedAt !== null) {
      throw new AppError("FORBIDDEN", {
        message: "비활성화되었거나 탈퇴 처리된 계정입니다.",
      });
    }

    const { accessToken, refreshToken, refreshTokenExpiresAt } = createAuthTokens(
      existingOAuthUser.id,
      existingOAuthUser.role,
    );

    await authRepository.saveRefreshToken({
      userId: existingOAuthUser.id,
      tokenHash: tokenHash(refreshToken),
      expiresAt: refreshTokenExpiresAt,
    });

    return {
      user: {
        id: existingOAuthUser.id,
        email: existingOAuthUser.email,
        name: existingOAuthUser.name,
        phone: existingOAuthUser.phone,
        role: existingOAuthUser.role,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  const email = profile.email.trim().toLowerCase();

  /*
   * 같은 이메일의 LOCAL 계정 또는 다른 OAuth 계정이 이미 존재하면
   * 자동으로 계정을 합치지 않고 충돌로 처리한다.
   */
  const existingUserByEmail = await authRepository.findByEmail(email);

  if (existingUserByEmail) {
    throw new AppError("OAUTH_EMAIL_ALREADY_EXISTS", {
      message: "동일한 이메일로 가입된 계정이 이미 존재합니다.",
    });
  }

  try {
    return await runTransaction(async (tx) => {
      const user = await authRepository.create(
        {
          email,
          password: null,
          name: profile.name.trim(),
          phone: null,
          role: requestedRole,
          authProvider: profile.provider,
          providerUserId: profile.providerUserId,
        },
        tx,
      );

      const { accessToken, refreshToken, refreshTokenExpiresAt } = createAuthTokens(
        user.id,
        user.role,
      );

      await authRepository.saveRefreshToken(
        {
          userId: user.id,
          tokenHash: tokenHash(refreshToken),
          expiresAt: refreshTokenExpiresAt,
        },
        tx,
      );

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      };
    });
  } catch (error) {
    /*
     * 이메일 또는 provider 복합 UNIQUE 충돌을
     * 동시 가입 요청에서도 안전하게 처리한다.
     */
    if (
      isUniqueConstraintError(error, "email") ||
      isUniqueConstraintError(error, "providerUserId")
    ) {
      throw new AppError("CONFLICT", {
        message: "이미 가입된 OAuth 계정입니다.",
      });
    }

    throw error;
  }
};

/*
 * Google OAuth 로그인
 *
 * Authorization Code를 Google 프로필로 변환한 뒤
 * 공통 OAuth 로그인 로직을 실행한다.
 */
const loginWithGoogle = async (input: GoogleOAuthInput): Promise<AuthResponse> => {
  const profile = await googleOAuth.getGoogleOAuthProfile(input.code);

  return loginWithOAuth(profile, input.role);
};

/*
 * Kakao OAuth 로그인
 *
 * Authorization Code를 Kakao 프로필로 변환한 뒤
 * 공통 OAuth 로그인 로직을 실행한다.
 */
const loginWithKakao = async (input: KakaoOAuthInput): Promise<AuthResponse> => {
  const profile = await kakaoOAuth.getKakaoOAuthProfile(input.code);

  return loginWithOAuth(profile, input.role);
};

/*
 * Access Token 및 Refresh Token 재발급
 *
 * Refresh Token Rotation을 적용한다.
 *
 * 기존 Refresh Token은 물리적으로 삭제하지 않고
 * revokedAt을 기록하여 사용 불가능한 상태로 변경한다.
 *
 * 기존 토큰 revoke와 신규 토큰 저장은
 * 하나의 트랜잭션으로 처리한다.
 */
const refresh = async (input: RefreshInput): Promise<AuthTokens> => {
  const currentRefreshToken = input.refreshToken;

  let refreshTokenPayload;

  try {
    refreshTokenPayload = verifyRefreshToken(currentRefreshToken);
  } catch {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  const currentTokenHash = tokenHash(currentRefreshToken);

  const storedRefreshToken = await authRepository.findRefreshTokenByHash(currentTokenHash);

  /*
   * JWT 자체가 유효하더라도 DB에 저장된 토큰이 없다면
   * 서버가 발급한 유효한 로그인 세션으로 볼 수 없다.
   */
  if (!storedRefreshToken) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  /*
   * 이미 Rotation 또는 로그아웃으로 revoke된 토큰은
   * 다시 사용할 수 없다.
   */
  if (storedRefreshToken.revokedAt !== null) {
    throw new AppError("UNAUTHORIZED", {
      message: "이미 사용되었거나 폐기된 Refresh Token입니다.",
    });
  }

  /*
   * DB 기준 만료 시간도 검증한다.
   *
   * JWT exp 검증과 별개로 서버가 저장한 세션의
   * 만료 상태를 다시 확인한다.
   *
   * 만료된 토큰은 삭제하지 않고 revoke 처리하여
   * 일정 기간 이력을 유지한다.
   */
  if (storedRefreshToken.expiresAt.getTime() <= Date.now()) {
    await authRepository.revokeRefreshTokenByHash(currentTokenHash);

    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  /*
   * JWT의 userId와 DB Refresh Token의 userId가
   * 일치하는지 확인한다.
   */
  if (refreshTokenPayload.userId !== storedRefreshToken.userId) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  const user = await authRepository.findById(storedRefreshToken.userId);

  if (!user) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  /*
   * 비활성화되었거나 탈퇴 처리된 사용자는
   * 기존 Refresh Token이 남아 있더라도 재발급할 수 없다.
   */
  if (!user.isActive || user.deletedAt !== null) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  const { accessToken, refreshToken, refreshTokenExpiresAt } = createAuthTokens(user.id, user.role);

  /*
   * 기존 Refresh Token revoke와
   * 새로운 Refresh Token 저장을 하나의 트랜잭션으로 처리한다.
   *
   * revoke 결과 count가 1인 요청만 성공하도록 하여
   * 동일 Refresh Token으로 동시에 재발급 요청이 들어와도
   * 하나의 요청만 Rotation에 성공하도록 한다.
   */
  await runTransaction(async (tx) => {
    const revokeResult = await authRepository.revokeRefreshTokenByHash(currentTokenHash, tx);

    if (revokeResult.count !== 1) {
      throw new AppError("UNAUTHORIZED", {
        message: "이미 사용되었거나 유효하지 않은 Refresh Token입니다.",
      });
    }

    await authRepository.saveRefreshToken(
      {
        userId: user.id,
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
 * 현재 로그인 세션 로그아웃
 *
 * 다중 로그인을 허용하므로 사용자의 모든 Refresh Token을
 * 폐기하지 않고 전달된 Refresh Token에 해당하는 세션만 폐기한다.
 *
 * Refresh Token 레코드는 삭제하지 않고
 * revokedAt을 기록하여 로그아웃 이력을 유지한다.
 */
const logout = async (input: LogoutInput): Promise<void> => {
  const currentRefreshToken = input.refreshToken;
  const currentTokenHash = tokenHash(currentRefreshToken);

  /*
   * 로그아웃은 멱등성을 유지한다.
   *
   * 이미 revoke된 토큰이나 존재하지 않는 토큰으로
   * 다시 요청해도 에러를 발생시키지 않고 정상 처리한다.
   */
  await authRepository.revokeRefreshTokenByHash(currentTokenHash);
};

export const authService = {
  signUpCustomer,
  signUpMover,
  login,
  loginWithGoogle,
  loginWithKakao,
  refresh,
  logout,
};
