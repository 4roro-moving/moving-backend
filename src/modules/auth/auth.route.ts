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

authRouter.post(
  "/refresh",
  validate({
    body: authValidator.refresh,
  }),
  authController.refresh,
);

authRouter.post(
  "/logout",
  validate({
    body: authValidator.logout,
  }),
  authController.logout,
);

export { authRouter };
