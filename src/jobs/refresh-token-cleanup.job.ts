import cron from "node-cron";

import logger from "../config/logger";
import { authService } from "../modules/auth/auth.service";

/*
 * 만료 Refresh Token 정리 배치 작업을 시작한다.
 *
 * 매일 새벽 3시(KST)에 실행되며,
 * 만료 후 30일이 지난 Refresh Token을 영구 삭제한다.
 */
export const startRefreshTokenCleanupJob = (): void => {
  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        const deletedCount = await authService.cleanupExpiredRefreshTokens();

        logger.info("Refresh token cleanup completed.", {
          deletedCount,
        });
      } catch (error) {
        logger.error("Refresh token cleanup failed.", {
          error,
        });
      }
    },
    {
      timezone: "Asia/Seoul",
    },
  );

  logger.info("Refresh token cleanup job started.");
};
