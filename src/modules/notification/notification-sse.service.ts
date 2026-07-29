import type { Response } from "express";

import logger from "../../config/logger";

import type { NotificationItem } from "./notification.type";

const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/*
 * 사용자별 SSE 연결을 저장한다.
 *
 * 동일한 사용자가 여러 브라우저 탭이나 기기에서
 * 동시에 접속할 수 있으므로 Response 객체를 Set으로 관리한다.
 */
const connections = new Map<string, Set<Response>>();

let heartbeatInterval: NodeJS.Timeout | null = null;

/*
 * SSE 형식에 맞게 이벤트를 작성한다.
 *
 * event에는 클라이언트가 구분할 이벤트 이름을 전달하고,
 * data에는 JSON으로 변환할 데이터를 전달한다.
 */
const writeEvent = (response: Response, event: string, data: unknown): void => {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
};

/*
 * 활성화된 SSE 연결이 하나도 없으면
 * heartbeat 작업을 종료한다.
 */
const stopHeartbeatIfUnused = (): void => {
  if (connections.size > 0 || heartbeatInterval === null) {
    return;
  }

  clearInterval(heartbeatInterval);
  heartbeatInterval = null;
};

/*
 * 특정 사용자의 SSE 연결을 제거한다.
 *
 * 한 사용자의 모든 연결이 제거되면
 * 사용자 정보도 연결 목록에서 삭제한다.
 *
 * 전체 SSE 연결이 하나도 남지 않으면
 * heartbeat 작업도 함께 종료한다.
 */
const removeConnection = (userId: string, response: Response): void => {
  const userConnections = connections.get(userId);

  if (!userConnections) {
    return;
  }

  userConnections.delete(response);

  if (userConnections.size === 0) {
    connections.delete(userId);
  }

  stopHeartbeatIfUnused();

  logger.info("SSE 연결이 제거되었습니다.", {
    userId,
    connectionCount: userConnections.size,
  });
};

/*
 * 연결된 모든 클라이언트에게 heartbeat를 전송한다.
 *
 * 일정 시간 동안 데이터가 전송되지 않으면
 * 프록시나 브라우저가 연결을 종료할 수 있으므로
 * 30초마다 SSE 주석 형식의 heartbeat를 전송한다.
 *
 * 이미 종료된 연결은 연결 목록에서 제거한다.
 */
const sendHeartbeat = (): void => {
  connections.forEach((userConnections, userId) => {
    userConnections.forEach((response) => {
      if (response.writableEnded || response.destroyed) {
        removeConnection(userId, response);

        return;
      }

      try {
        response.write(`: heartbeat ${new Date().toISOString()}\n\n`);
      } catch (error) {
        logger.warn("SSE heartbeat 전송에 실패했습니다.", {
          userId,
          error,
        });

        removeConnection(userId, response);
      }
    });
  });
};

/*
 * heartbeat 작업을 시작한다.
 *
 * 이미 heartbeat 작업이 실행 중이면
 * 새로운 interval을 중복 생성하지 않는다.
 */
const startHeartbeat = (): void => {
  if (heartbeatInterval !== null) {
    return;
  }

  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
};

/*
 * 인증된 사용자의 SSE 연결을 등록한다.
 *
 * 동일한 사용자의 기존 연결을 덮어쓰지 않고
 * 새로운 연결을 추가한다.
 *
 * 연결 등록 후 클라이언트에게
 * connected 이벤트를 전송한다.
 */
const addConnection = (userId: string, response: Response): void => {
  const userConnections = connections.get(userId) ?? new Set<Response>();

  userConnections.add(response);
  connections.set(userId, userConnections);

  writeEvent(response, "connected", {
    connectedAt: new Date().toISOString(),
  });

  startHeartbeat();

  logger.info("SSE 연결이 등록되었습니다.", {
    userId,
    connectionCount: userConnections.size,
  });
};

/*
 * 특정 사용자에게 새 알림 이벤트를 전송한다.
 *
 * 사용자가 여러 브라우저 탭이나 기기에서 연결된 경우
 * 해당 사용자의 모든 연결에 알림을 전송한다.
 *
 * 현재 연결된 사용자가 없다면
 * DB에 저장된 알림만 유지하고 별도 처리는 하지 않는다.
 */
const sendNotification = (userId: string, notification: NotificationItem): void => {
  const userConnections = connections.get(userId);

  if (!userConnections) {
    return;
  }

  userConnections.forEach((response) => {
    if (response.writableEnded || response.destroyed) {
      removeConnection(userId, response);

      return;
    }

    try {
      writeEvent(response, "notification", notification);
    } catch (error) {
      logger.warn("SSE 알림 전송에 실패했습니다.", {
        userId,
        notificationId: notification.id,
        error,
      });

      removeConnection(userId, response);
    }
  });
};

/*
 * 서버 종료 시 현재 연결된 모든 SSE 응답을 종료한다.
 *
 * heartbeat interval도 함께 정리하여
 * 서버 종료 후 타이머가 남지 않도록 한다.
 */
const closeAllConnections = (): void => {
  connections.forEach((userConnections) => {
    userConnections.forEach((response) => {
      if (!response.writableEnded) {
        response.end();
      }
    });
  });

  connections.clear();

  if (heartbeatInterval !== null) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  logger.info("모든 SSE 연결이 종료되었습니다.");
};

export const notificationSseService = {
  addConnection,
  removeConnection,
  sendNotification,
  closeAllConnections,
};
