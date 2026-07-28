import { Router } from "express";

import { validate } from "../../middlewares/validate";

import { authController } from "./auth.controller";
import { authValidator } from "./auth.validator";

const authRouter = Router();

authRouter.post(
  "/signup/customer",
  validate({
    body: authValidator.signUp,
  }),
  authController.signUpCustomer,
);

authRouter.post(
  "/signup/mover",
  validate({
    body: authValidator.signUp,
  }),
  authController.signUpMover,
);

authRouter.post(
  "/login",
  validate({
    body: authValidator.login,
  }),
  authController.login,
);

authRouter.post(
  "/oauth/google",
  validate({
    body: authValidator.googleOAuth,
  }),
  authController.loginWithGoogle,
);

authRouter.post(
  "/oauth/kakao",
  validate({
    body: authValidator.kakaoOAuth,
  }),
  authController.loginWithKakao,
);

/**
 * Naver OAuth state 발급
 */
authRouter.get("/oauth/naver/state", authController.createNaverOAuthState);

authRouter.post(
  "/oauth/naver",
  validate({
    body: authValidator.naverOAuth,
  }),
  authController.loginWithNaver,
);

/**
 * Refresh Token은 HttpOnly Cookie에서 조회한다.
 */
authRouter.post("/refresh", authController.refresh);

/**
 * Refresh Token은 HttpOnly Cookie에서 조회한다.
 */
authRouter.post("/logout", authController.logout);

export { authRouter };
