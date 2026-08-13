import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import cron from "node-cron";

import logger from "../config/logger";
import { authService } from "../modules/auth/auth.service";
import { startRefreshTokenCleanupJob } from "./refresh-token-cleanup.job";

type ScheduledJobHandler = () => Promise<void> | void;

type ScheduleCall = {
  expression: string;
  handler: ScheduledJobHandler;
  options: {
    timezone: string;
  };
};

describe("refresh token cleanup job", () => {
  const originalSchedule = cron.schedule;
  const originalInfo = logger.info;
  const originalError = logger.error;
  const originalCleanup = authService.cleanupExpiredRefreshTokens;

  let scheduleCalls: ScheduleCall[] = [];
  let infoLogs: Array<{ message: string; meta?: unknown }> = [];
  let errorLogs: Array<{ message: string; meta?: unknown }> = [];

  afterEach(() => {
    cron.schedule = originalSchedule;
    logger.info = originalInfo;
    logger.error = originalError;
    authService.cleanupExpiredRefreshTokens = originalCleanup;
    scheduleCalls = [];
    infoLogs = [];
    errorLogs = [];
  });

  function stubLogger(): void {
    logger.info = ((message: string, meta?: unknown) => {
      infoLogs.push({ message, meta });
    }) as typeof logger.info;

    logger.error = ((message: string, meta?: unknown) => {
      errorLogs.push({ message, meta });
    }) as typeof logger.error;
  }

  function stubSchedule(): void {
    cron.schedule = ((expression, handler, options) => {
      scheduleCalls.push({
        expression,
        handler: handler as ScheduledJobHandler,
        options: options as ScheduleCall["options"],
      });

      return {
        stop: () => undefined,
      };
    }) as typeof cron.schedule;
  }

  it('registers cron expression "0 3 * * *" with Asia/Seoul timezone', () => {
    stubSchedule();
    stubLogger();

    startRefreshTokenCleanupJob();

    assert.equal(scheduleCalls.length, 1);
    assert.equal(scheduleCalls[0]?.expression, "0 3 * * *");
    assert.equal(scheduleCalls[0]?.options.timezone, "Asia/Seoul");
  });

  it("calls cleanupExpiredRefreshTokens when the scheduled handler runs", async () => {
    stubSchedule();
    stubLogger();

    let cleanupCalled = false;
    authService.cleanupExpiredRefreshTokens = async () => {
      cleanupCalled = true;
      return 4;
    };

    startRefreshTokenCleanupJob();
    await scheduleCalls[0]?.handler();

    assert.equal(cleanupCalled, true);
  });

  it("logs deletedCount when cleanup succeeds", async () => {
    stubSchedule();
    stubLogger();

    authService.cleanupExpiredRefreshTokens = async () => 9;

    startRefreshTokenCleanupJob();
    await scheduleCalls[0]?.handler();

    assert.deepEqual(infoLogs.at(-1), {
      message: "Refresh token cleanup completed.",
      meta: {
        deletedCount: 9,
      },
    });
  });

  it("logs the error and does not terminate the process when cleanup fails", async () => {
    stubSchedule();
    stubLogger();

    const cleanupError = new Error("cleanup failed");
    authService.cleanupExpiredRefreshTokens = async () => {
      throw cleanupError;
    };

    startRefreshTokenCleanupJob();

    await assert.doesNotReject(async () => {
      await scheduleCalls[0]?.handler();
    });

    assert.deepEqual(errorLogs.at(-1), {
      message: "Refresh token cleanup failed.",
      meta: {
        error: cleanupError,
      },
    });
  });
});
