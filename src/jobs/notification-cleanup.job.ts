import cron from "node-cron";

import logger from "../config/logger";
import { notificationService } from "../modules/notification/notification.service";

/*
 * 만료 알림 정리 배치 작업을 시작한다.
 *
 * 매일 새벽 3시(KST)에 실행되며,
 * 만료 후 90일이 지난 알림을 영구 삭제한다.
 */
export const startNotificationCleanupJob = (): void => {
  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        const deletedCount = await notificationService.cleanupExpiredNotifications();

        logger.info("Notification cleanup completed.", {
          deletedCount,
        });
      } catch (error) {
        logger.error("Notification cleanup failed.", {
          error,
        });
      }
    },
    {
      timezone: "Asia/Seoul",
    },
  );

  logger.info("Notification cleanup job started.");
};
