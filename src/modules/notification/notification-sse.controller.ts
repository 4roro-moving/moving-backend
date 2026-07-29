import type { Request, Response } from "express";

import { AppError } from "../../lib/app-error";

import { notificationSseService } from "./notification-sse.service";

/*
 * 인증된 사용자의 SSE 연결을 시작한다.
 *
 * SSE 응답에 필요한 헤더를 설정한 뒤
 * 사용자의 연결을 SSE Service에 등록한다.
 *
 * 브라우저를 닫거나 네트워크가 끊기면
 * close 이벤트를 통해 연결 정보를 제거한다.
 */
const subscribe = (req: Request, res: Response): void => {
  const userId = req.user?.id;

  /*
   * authenticate 미들웨어를 통과했더라도
   * 방어적으로 사용자 정보를 다시 확인한다.
   */
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
   * 사용자의 SSE 연결을 등록한다.
   */
  notificationSseService.addConnection(userId, res);

  /*
   * 브라우저 종료, 새로고침 등으로
   * 연결이 종료되면 SSE 연결을 제거한다.
   */
  req.on("close", () => {
    notificationSseService.removeConnection(userId, res);
  });
};

export const notificationSseController = {
  subscribe,
};
