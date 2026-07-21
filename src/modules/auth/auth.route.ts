import { Router } from "express";

import { authController } from "./auth.controller";

const authRouter = Router();

/*
 * 일반 고객 회원가입
 *
 * POST /auth/signup/customer
 */
authRouter.post("/signup/customer", authController.signUpCustomer);

/*
 * 기사 회원가입
 *
 * POST /auth/signup/mover
 */
authRouter.post("/signup/mover", authController.signUpMover);

/*
 * 로컬 로그인
 *
 * POST /auth/login
 */
authRouter.post("/login", authController.login);

/*
 * Access Token 및 Refresh Token 재발급
 *
 * POST /auth/refresh
 */
authRouter.post("/refresh", authController.refresh);

/*
 * 현재 로그인 세션 로그아웃
 *
 * POST /auth/logout
 */
authRouter.post("/logout", authController.logout);

export { authRouter };
