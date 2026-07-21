import bcrypt from "bcrypt";
import { AuthProvider, Prisma, UserRole } from "@prisma/client";

import { authRepository } from "./auth.repository";

import type {
  AuthResponse,
  AuthTokens,
  LoginInput,
  LogoutInput,
  RefreshInput,
  SignUpInput,
} from "./auth.type";

import { ApiError } from "../../utils/ApiError";

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
const createAuthTokens = (userId: string, role: UserRole) => {
  const tokenPayload = {
    userId,
    role,
  };

  const accessToken = createAccessToken(tokenPayload);

  const refreshToken = createRefreshToken(tokenPayload);

  const refreshTokenPayload = verifyRefreshToken(refreshToken);

  if (!refreshTokenPayload.exp) {
    throw new ApiError("INTERNAL_SERVER_ERROR", {
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
    throw new ApiError("CONFLICT", {
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
      throw new ApiError("CONFLICT", {
        message: "이미 사용 중인 이메일입니다.",
      });
    }

    /*
     * 전화번호가 UNIQUE로 설정되어 있다면
     * 중복 전화번호 회원가입 요청을 처리한다.
     */
    if (isUniqueConstraintError(error, "phone")) {
      throw new ApiError("CONFLICT", {
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
    throw new ApiError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  /*
   * OAuth로 가입한 사용자는 로컬 비밀번호 로그인을
   * 사용할 수 없도록 막는다.
   */
  if (user.authProvider !== AuthProvider.LOCAL || !user.password) {
    throw new ApiError("UNAUTHORIZED", {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    });
  }

  const isPasswordMatched = await bcrypt.compare(input.password, user.password);

  if (!isPasswordMatched) {
    throw new ApiError("UNAUTHORIZED", {
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
 * Access Token 및 Refresh Token 재발급
 *
 * Refresh Token Rotation을 적용한다.
 *
 * 기존 Refresh Token을 삭제한 뒤
 * 새로운 Access Token과 Refresh Token을 발급한다.
 */
const refresh = async (input: RefreshInput): Promise<AuthTokens> => {
  const currentRefreshToken = input.refreshToken;

  let refreshTokenPayload;

  try {
    refreshTokenPayload = verifyRefreshToken(currentRefreshToken);
  } catch {
    throw new ApiError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  const currentTokenHash = tokenHash(currentRefreshToken);

  const storedRefreshToken = await authRepository.findRefreshTokenByHash(currentTokenHash);

  /*
   * JWT 자체가 유효하더라도 DB에 토큰이 없으면
   * 로그아웃되었거나 이미 사용된 Refresh Token이다.
   */
  if (!storedRefreshToken) {
    throw new ApiError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  /*
   * DB 기준 만료 시간도 검증한다.
   *
   * JWT exp 검증과 별개로 서버가 저장한 세션의
   * 만료 상태를 다시 확인한다.
   */
  if (storedRefreshToken.expiresAt.getTime() <= Date.now()) {
    await authRepository.deleteRefreshTokenByHash(currentTokenHash);

    throw new ApiError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  /*
   * JWT의 userId와 DB Refresh Token의 userId가
   * 일치하는지 확인한다.
   */
  if (refreshTokenPayload.userId !== storedRefreshToken.userId) {
    throw new ApiError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  const user = await authRepository.findById(storedRefreshToken.userId);

  if (!user) {
    throw new ApiError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Refresh Token입니다.",
    });
  }

  const { accessToken, refreshToken, refreshTokenExpiresAt } = createAuthTokens(user.id, user.role);

  /*
   * 기존 Refresh Token 삭제와 신규 Refresh Token 저장은
   * 하나의 트랜잭션으로 처리한다.
   *
   * deleteMany 결과의 count를 확인하여
   * 동일 Refresh Token으로 동시에 재발급 요청이 들어와도
   * 하나의 요청만 성공하도록 한다.
   */
  await runTransaction(async (tx) => {
    const deleteResult = await authRepository.deleteRefreshTokenByHash(currentTokenHash, tx);

    if (deleteResult.count !== 1) {
      throw new ApiError("UNAUTHORIZED", {
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
 * 삭제하지 않고 전달된 Refresh Token에 해당하는 세션만 삭제한다.
 */
const logout = async (input: LogoutInput): Promise<void> => {
  const currentRefreshToken = input.refreshToken;

  const currentTokenHash = tokenHash(currentRefreshToken);

  /*
   * 로그아웃은 멱등성을 유지한다.
   *
   * 이미 삭제된 토큰으로 다시 로그아웃 요청이 들어와도
   * 에러를 발생시키지 않고 정상 처리한다.
   */
  await authRepository.deleteRefreshTokenByHash(currentTokenHash);
};

export const authService = {
  signUpCustomer,
  signUpMover,
  login,
  refresh,
  logout,
};
