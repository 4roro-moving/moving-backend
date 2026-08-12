import bcrypt from "bcrypt";
import { AuthProvider, Prisma, RefreshTokenSessionType, UserRole } from "@prisma/client";

import { authRepository } from "./auth.repository";
import { googleOAuth } from "./oauth/google.oauth";
import { kakaoOAuth } from "./oauth/kakao.oauth";
import { naverOAuth } from "./oauth/naver.oauth";

import type { AuthResponse, IssuedAuthTokens, OAuthProfile, RefreshResponse } from "./auth.type";

import type {
  GoogleOAuthInput,
  KakaoOAuthInput,
  NaverOAuthInput,
  LoginInput,
  SignUpInput,
} from "./auth.validator";

import { AppError } from "../../lib/app-error";

import { createAccessToken, createRefreshToken, verifyRefreshToken } from "../../utils/jwt";

import { tokenHash } from "../../utils/tokenHash";
import { runTransaction } from "../../utils/transaction";

const PASSWORD_SALT_ROUNDS = 10;

const DUMMY_PASSWORD_HASH = "$2b$10$CxtIUUg2JDRWy.TYdu0y0e9bahGlNcJg2F78GaW9lRboxNL/OZpE6";

const getAuthProviderName = (provider: AuthProvider): string => {
  const providerNames: Record<AuthProvider, string> = {
    [AuthProvider.LOCAL]: "이메일",
    [AuthProvider.GOOGLE]: "구글",
    [AuthProvider.KAKAO]: "카카오",
    [AuthProvider.NAVER]: "네이버",
  };

  return providerNames[provider];
};

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
): IssuedAuthTokens & { refreshTokenExpiresAt: Date } => {
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
          sessionType: RefreshTokenSessionType.USER,
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
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);

    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  /*
   * 요청한 로그인 역할과 실제 DB에 저장된 역할이 다르면
   * 해당 로그인 경로를 사용할 수 없다.
   *
   * 클라이언트가 전달한 role은 기대 역할 검증 용도로만 사용하며,
   * 실제 권한과 토큰의 role은 DB의 user.role을 기준으로 한다.
   *
   * 역할 불일치 시에도 Dummy bcrypt 비교를 수행하여
   * 로그인 실패 경로 간 명확한 연산 차이를 줄인다.
   */
  if (user.role !== input.role) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);

    throw new AppError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  /*
   * 비활성화되었거나 탈퇴 처리된 사용자는
   * 새로운 로그인 세션을 생성할 수 없다.
   */
  if (!user.isActive && user.deletedAt === null) {
    throw new AppError("ACCOUNT_SUSPENDED");
  }

  if (user.deletedAt !== null) {
    throw new AppError("FORBIDDEN", {
      message: "비활성화되었거나 탈퇴 처리된 계정입니다.",
    });
  }

  /*
   * OAuth로 가입한 사용자는 로컬 비밀번호 로그인을
   * 사용할 수 없도록 막는다.
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

  const { accessToken, refreshToken, refreshTokenExpiresAt } = createAuthTokens(user.id, user.role);

  /*
   * 다중 로그인을 허용하므로 기존 Refresh Token을
   * 덮어쓰지 않고 새로운 로그인 세션을 추가한다.
   *
   * DB에는 Refresh Token 원문이 아니라
   * HMAC-SHA256 해시값만 저장한다.
   *
   * 일반 인증에서 발급된 세션이므로
   * sessionType은 USER로 저장한다.
   */
  await authRepository.saveRefreshToken({
    userId: user.id,
    tokenHash: tokenHash(refreshToken),
    sessionType: RefreshTokenSessionType.USER,
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
 * OAuth 계정 로그인 응답을 생성한다.
 *
 * 이미 가입된 OAuth 사용자와 동시 가입 충돌 후 다시 조회한 사용자가
 * 동일한 로그인 흐름을 사용하도록 공통 처리한다.
 */
type OAuthUser = NonNullable<
  Awaited<ReturnType<typeof authRepository.findByProviderAndProviderId>>
>;

const createOAuthLoginResponse = async (user: OAuthUser): Promise<AuthResponse> => {
  if (!user.isActive && user.deletedAt === null) {
    throw new AppError("ACCOUNT_SUSPENDED");
  }

  if (user.deletedAt !== null) {
    throw new AppError("FORBIDDEN", {
      message: "비활성화되었거나 탈퇴 처리된 계정입니다.",
    });
  }

  const { accessToken, refreshToken, refreshTokenExpiresAt } = createAuthTokens(user.id, user.role);

  await authRepository.saveRefreshToken({
    userId: user.id,
    tokenHash: tokenHash(refreshToken),
    sessionType: RefreshTokenSessionType.USER,
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
 *
 * 동일한 OAuth 계정으로 요청이 동시에 들어와 신규 생성이 충돌한 경우에는
 * 충돌 후 해당 계정을 다시 조회하여 기존 사용자 로그인 흐름으로 이어간다.
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
    return createOAuthLoginResponse(existingOAuthUser);
  }

  const email = profile.email.trim().toLowerCase();

  /*
   * 같은 이메일의 LOCAL 계정 또는 다른 OAuth 계정이 이미 존재하면
   * 자동으로 계정을 합치지 않고 충돌로 처리한다.
   */
  const existingUserByEmail = await authRepository.findByEmail(email);

  if (existingUserByEmail) {
    const providerName = getAuthProviderName(existingUserByEmail.authProvider);

    throw new AppError("OAUTH_EMAIL_ALREADY_EXISTS", {
      message: `이미 ${providerName} 계정으로 가입된 이메일입니다. ${providerName} 로그인을 이용해주세요.`,
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
          sessionType: RefreshTokenSessionType.USER,
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
     * 동일한 OAuth 계정의 동시 최초 로그인에서는 두 요청이 모두
     * 사전 조회를 통과한 뒤 한 요청만 사용자 생성에 성공할 수 있다.
     *
     * P2002 발생 시 어떤 UNIQUE 인덱스가 먼저 충돌했는지와 관계없이
     * provider + providerUserId로 다시 조회한다.
     *
     * 조회에 성공하면 다른 요청이 이미 생성한 동일 OAuth 계정이므로
     * CONFLICT로 종료하지 않고 정상 로그인 흐름으로 이어간다.
     */
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentOAuthUser = await authRepository.findByProviderAndProviderId(
        profile.provider,
        profile.providerUserId,
      );

      if (concurrentOAuthUser) {
        return createOAuthLoginResponse(concurrentOAuthUser);
      }

      /*
       * 동일 OAuth 계정이 조회되지 않는다면 이메일 UNIQUE 충돌 등
       * 실제로 다른 계정과 충돌한 상황인지 다시 확인한다.
       */
      const existingUser = await authRepository.findByEmail(email);

      if (existingUser) {
        const providerName = getAuthProviderName(existingUser.authProvider);

        throw new AppError("OAUTH_EMAIL_ALREADY_EXISTS", {
          message: `이미 ${providerName} 계정으로 가입된 이메일입니다. ${providerName} 로그인을 이용해주세요.`,
        });
      }
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
 * Naver OAuth 로그인
 *
 * Authorization Code와 state를 Naver 프로필로 변환한 뒤
 * 공통 OAuth 로그인 로직을 실행한다.
 */
const loginWithNaver = async (input: NaverOAuthInput): Promise<AuthResponse> => {
  const profile = await naverOAuth.getNaverOAuthProfile(input.code, input.state);

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
const refresh = async (currentRefreshToken: string): Promise<RefreshResponse> => {
  let refreshTokenPayload;

  try {
    refreshTokenPayload = verifyRefreshToken(currentRefreshToken);
  } catch {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  const currentTokenHash = tokenHash(currentRefreshToken);

  /*
   * 일반 사용자 인증에서 생성된 USER 세션만 조회한다.
   *
   * 동일한 Token Hash가 전달되더라도 관리자 인증 세션은
   * 일반 Refresh API에서 사용할 수 없다.
   */
  const storedRefreshToken = await authRepository.findRefreshTokenByHash(
    currentTokenHash,
    RefreshTokenSessionType.USER,
  );

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
    await authRepository.revokeRefreshTokenByHash(currentTokenHash, RefreshTokenSessionType.USER);

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
  if (!user.isActive && user.deletedAt === null) {
    throw new AppError("ACCOUNT_SUSPENDED");
  }

  if (user.deletedAt !== null) {
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
   *
   * 기존 세션 폐기와 신규 세션 저장 모두
   * USER 세션 범위 안에서만 처리한다.
   */
  await runTransaction(async (tx) => {
    const revokeResult = await authRepository.revokeRefreshTokenByHash(
      currentTokenHash,
      RefreshTokenSessionType.USER,
      tx,
    );

    if (revokeResult.count !== 1) {
      throw new AppError("UNAUTHORIZED", {
        message: "이미 사용되었거나 유효하지 않은 Refresh Token입니다.",
      });
    }

    await authRepository.saveRefreshToken(
      {
        userId: user.id,
        tokenHash: tokenHash(refreshToken),
        sessionType: RefreshTokenSessionType.USER,
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
const logout = async (currentRefreshToken: string): Promise<void> => {
  const currentTokenHash = tokenHash(currentRefreshToken);

  /*
   * 로그아웃은 멱등성을 유지한다.
   *
   * 이미 revoke된 토큰이나 존재하지 않는 토큰으로
   * 다시 요청해도 에러를 발생시키지 않고 정상 처리한다.
   *
   * 일반 로그아웃 API에서는 USER 세션만 폐기한다.
   */
  await authRepository.revokeRefreshTokenByHash(currentTokenHash, RefreshTokenSessionType.USER);
};

export const authService = {
  signUpCustomer,
  signUpMover,
  login,
  loginWithGoogle,
  loginWithKakao,
  loginWithNaver,
  refresh,
  logout,
};
