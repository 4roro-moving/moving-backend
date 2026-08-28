import logger from "../../config/logger";

import { profileImageService } from "./profile-image.service";

export type ProfileImageCleanupAction =
  "DELETE_TEMP_IMAGE" | "DELETE_PREVIOUS_IMAGE" | "ROLLBACK_FINALIZED_IMAGE";

interface CleanupImageContext {
  userId: string;
  key: string;
  action: ProfileImageCleanupAction;
}

/**
 * 프로필 핵심 DB 작업 이후 수행되는
 * S3 이미지 정리가 실패하더라도
 * 이미 완료된 사용자 요청을 실패 처리하지 않는다.
 *
 * 정리 실패는 로그에 기록하여
 * 추후 고아 객체 추적 및 장애 분석에 활용한다.
 */
export const cleanupImageSafely = async (
  cleanup: () => Promise<void>,
  context: CleanupImageContext,
): Promise<void> => {
  try {
    await cleanup();
  } catch (error) {
    logger.error("프로필 이미지 S3 정리에 실패했습니다.", {
      ...context,
      error,
    });
  }
};

/**
 * temp → final 복사는 성공했지만
 * 이후 DB Transaction이 실패한 경우
 * 새로 생성된 final 이미지를 보상 삭제한다.
 *
 * 보상 삭제 실패가 원래 발생한 오류를 덮어쓰지 않도록
 * 실패는 로그만 기록한다.
 */
export const rollbackFinalizedImageSafely = async (
  userId: string,
  finalKey: string | undefined,
): Promise<void> => {
  if (finalKey === undefined) {
    return;
  }

  await cleanupImageSafely(() => profileImageService.deleteProfileImage(userId, finalKey), {
    userId,
    key: finalKey,
    action: "ROLLBACK_FINALIZED_IMAGE",
  });
};
