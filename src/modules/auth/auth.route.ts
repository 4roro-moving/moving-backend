import { Router } from "express";

import { csrfProtection } from "../../middlewares/csrf.middleware";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";

import { authController } from "./auth.controller";
import { authValidator } from "./auth.validator";

const authRouter = Router();

/*
 * 일반 고객 회원가입
 *
 * 요청 Body를 검증한 뒤
 * 고객 계정을 생성한다.
 */
authRouter.post(
  "/signup/customer",
  validate({
    body: authValidator.signUp,
  }),
  asyncHandler(authController.signUpCustomer),
);

/*
 * 기사 회원가입
 *
 * 요청 Body를 검증한 뒤
 * 기사 계정을 생성한다.
 */
authRouter.post(
  "/signup/mover",
  validate({
    body: authValidator.signUp,
  }),
  asyncHandler(authController.signUpMover),
);

/*
 * 로컬 로그인
 *
 * 이메일과 비밀번호를 검증한 뒤
 * Access Token과 Refresh Token을 발급한다.
 */
authRouter.post(
  "/login",
  validate({
    body: authValidator.login,
  }),
  asyncHandler(authController.login),
);

/*
 * Google OAuth 로그인
 *
 * Google OAuth 인증 정보를 검증한 뒤
 * 로그인 또는 회원가입을 진행한다.
 */
authRouter.post(
  "/oauth/google",
  validate({
    body: authValidator.googleOAuth,
  }),
  asyncHandler(authController.loginWithGoogle),
);

/*
 * Kakao OAuth 로그인
 *
 * Kakao OAuth 인증 정보를 검증한 뒤
 * 로그인 또는 회원가입을 진행한다.
 */
authRouter.post(
  "/oauth/kakao",
  validate({
    body: authValidator.kakaoOAuth,
  }),
  asyncHandler(authController.loginWithKakao),
);

/*
 * Naver OAuth state를 발급한다.
 *
 * OAuth 요청 위조(CSRF)를 방지하기 위한
 * state 값을 생성하여 Cookie와 Response에 함께 반환한다.
 */
authRouter.get("/oauth/naver/state", authController.createNaverOAuthState);

/*
 * Naver OAuth 로그인
 *
 * OAuth 인증 정보를 검증한 뒤
 * 로그인 또는 회원가입을 진행한다.
 */
authRouter.post(
  "/oauth/naver",
  validate({
    body: authValidator.naverOAuth,
  }),
  asyncHandler(authController.loginWithNaver),
);

/*
 * Access Token 및 Refresh Token을 재발급한다.
 *
 * Refresh Token은 HttpOnly Cookie에서 조회하며
 * CSRF 보호를 적용한다.
 */
authRouter.post("/refresh", csrfProtection, asyncHandler(authController.refresh));

/*
 * 현재 로그인 세션을 로그아웃한다.
 *
 * Refresh Token은 HttpOnly Cookie에서 조회하며
 * CSRF 보호를 적용한다.
 */
authRouter.post("/logout", csrfProtection, asyncHandler(authController.logout));

export { authRouter };
