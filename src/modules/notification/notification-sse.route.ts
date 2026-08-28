import { Router } from "express";

import { authenticate } from "../../middlewares/auth";
import { asyncHandler } from "../../utils/async-handler.util";

import { notificationSseController } from "./notification-sse.controller";

const notificationSseRouter = Router();

/*
 * SSE 인증 방식
 *
 * SSE 연결은 JWT Access Token 인증이 필요하다.
 *
 * 기본 EventSource는 Authorization 헤더를 설정할 수 없으므로
 * 프론트에서는 fetch 기반 SSE 구현을 사용하여
 * Authorization Bearer 헤더를 전달한다.
 */

/*
 * SSE 연결을 시작한다.
 */
notificationSseRouter.get(
  "/subscribe",
  authenticate,
  asyncHandler(notificationSseController.subscribe),
);

export default notificationSseRouter;
