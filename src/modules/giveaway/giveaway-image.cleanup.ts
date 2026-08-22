import logger from "../../config/logger";

export type GiveawayImageCleanupAction =
  "DELETE_TEMP_IMAGE" | "DELETE_PREVIOUS_IMAGE" | "ROLLBACK_FINALIZED_IMAGE";

/**
 * DB 작업이 끝난 뒤의 S3 정리가 실패해도
 * 이미 완료된 나눔 요청을 실패 처리하지 않는다.
 */
export async function cleanupGiveawayImageSafely(
  cleanup: () => Promise<void>,
  context: { userId: string; key: string; action: GiveawayImageCleanupAction },
): Promise<void> {
  try {
    await cleanup();
  } catch (error) {
    logger.error("나눔 이미지 S3 정리에 실패했습니다.", {
      ...context,
      error,
    });
  }
}

export async function cleanupGiveawayImagesSafely(
  keys: string[],
  deleteKey: (key: string) => Promise<void>,
  context: { userId: string; action: GiveawayImageCleanupAction },
): Promise<void> {
  await Promise.all(
    keys.map((key) =>
      cleanupGiveawayImageSafely(() => deleteKey(key), {
        userId: context.userId,
        key,
        action: context.action,
      }),
    ),
  );
}
