import type { Server } from "node:http";

import app from "./app";
import { env } from "./config/env";
import logger from "./config/logger";
import { startNotificationCleanupJob } from "./jobs/notification-cleanup.job";
import { prisma } from "./lib/prisma";
import { notificationSseService } from "./modules/notification/notification-sse.service";
import { closeSocketServer, initializeSocket } from "./socket";

let server: Server | null = null;
let isShuttingDown = false;

/*
 * 서버 종료 시 SSE 연결과 DB 연결을 안전하게 정리한다.
 *
 * SIGINT 또는 SIGTERM 종료 신호를 받으면
 * 모든 SSE 연결을 종료한 뒤 HTTP 서버와 Prisma 연결을 종료한다.
 *
 * 종료 신호가 중복으로 발생해도
 * 종료 로직은 한 번만 실행한다.
 */
const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  logger.info(`${signal} 신호를 수신하여 서버 종료를 시작합니다.`);

  notificationSseService.closeAllConnections();
  await closeSocketServer();

  if (!server) {
    await prisma.$disconnect();

    logger.info("Server shutdown completed.");

    process.exit(0);
  }

  server.close(async (error) => {
    if (error) {
      logger.error("HTTP 서버 종료 중 오류가 발생했습니다.", {
        error,
      });

      await prisma.$disconnect();

      process.exit(1);
    }

    await prisma.$disconnect();

    logger.info("Database disconnected successfully.");
    logger.info("Server shutdown completed.");

    process.exit(0);
  });
};

async function bootstrap() {
  try {
    await prisma.$connect();

    logger.info("Database connected successfully.");

    server = app.listen(env.PORT, () => {
      logger.info(`Server is running on http://localhost:${env.PORT}`);

      /*
       * 만료 알림 정리 배치 작업을 등록한다.
       *
       * 매일 새벽 3시(KST)에 실행되어
       * 만료 후 90일이 지난 알림을 영구 삭제한다.
       */
      startNotificationCleanupJob();
    });

    initializeSocket(server);
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(error);
    } else {
      logger.error("Failed to start server.", {
        error,
      });
    }

    await prisma.$disconnect();
    process.exit(1);
  }
}

/*
 * 로컬에서 Ctrl + C로 종료할 때
 * 안전한 서버 종료 절차를 실행한다.
 */
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

/*
 * PM2 또는 배포 환경에서 종료 요청을 받을 때
 * 안전한 서버 종료 절차를 실행한다.
 */
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void bootstrap();
