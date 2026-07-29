import app from "./app";
import { env } from "./config/env";
import logger from "./config/logger";
import { startNotificationCleanupJob } from "./jobs/notification-cleanup.job";
import { prisma } from "./lib/prisma";

async function bootstrap() {
  try {
    await prisma.$connect();

    logger.info("Database connected successfully.");

    app.listen(env.PORT, () => {
      logger.info(`Server is running on http://localhost:${env.PORT}`);

      /*
       * 만료 알림 정리 배치 작업을 등록한다.
       *
       * 매일 새벽 3시(KST)에 실행되어
       * 만료 후 90일이 지난 알림을 영구 삭제한다.
       */
      startNotificationCleanupJob();
    });
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

void bootstrap();
