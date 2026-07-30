import type { Request, Response } from "express";

import { AppError } from "../../lib/app-error";

import { notificationSseService } from "./notification-sse.service";

/*
 * 인증된 사용자의 SSE 연결을 시작한다.
 *
 * authenticate 미들웨어가 Authorization Bearer Access Token을 검증하며,
 * 인증된 사용자 정보는 req.user에 저장된다.
 *
 * 브라우저 기본 EventSource는 Authorization 헤더를 설정할 수 없으므로
 * 프론트에서는 fetch 기반 SSE 클라이언트를 사용해야 한다.
 *
 * SSE 응답에 필요한 헤더를 설정한 뒤
 * 사용자의 연결을 SSE Service에 등록한다.
 *
 * 브라우저를 닫거나 네트워크가 끊기면
 * close 이벤트를 통해 연결 정보를 제거한다.
 */
const subscribe = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증 정보가 없습니다.",
    });
  }

  /*
   * SSE 연결을 위한 응답 헤더를 설정한다.
   */
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  /*
   * 설정한 헤더를 즉시 클라이언트에 전송한다.
   */
  res.flushHeaders();

  /*
   * SSE Service에 사용자의 연결을 등록한다.
   *
   * 등록된 연결은 notification 이벤트와
   * heartbeat 전송에 사용된다.
   */
  notificationSseService.addConnection(userId, res);

  /*
   * 브라우저 종료, 새로고침, 네트워크 연결 종료 등으로
   * SSE 연결이 종료되면 등록된 연결을 제거한다.
   */
  req.on("close", () => {
    notificationSseService.removeConnection(userId, res);
  });
};

export const notificationSseController = {
  subscribe,
};
