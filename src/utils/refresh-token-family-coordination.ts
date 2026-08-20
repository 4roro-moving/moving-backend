import type { RefreshTokenSessionType } from "@prisma/client";

import { tokenHash } from "./tokenHash";
import {
  getRefreshTokenFamilyReuseEpoch,
  incrementRefreshTokenFamilyReuseEpoch,
  tryClearRefreshTokenFamilyReuseEpoch,
} from "./refresh-token-family-reuse-epoch";
import { runRefreshTokenFamilySerialization } from "./refresh-token-family-serialization";

const shouldReconcileAfterRotation = (
  reuseEpochAtRotationStart: number,
  reuseEpochAtRotationEnd: number,
): boolean => {
  if (reuseEpochAtRotationEnd > reuseEpochAtRotationStart) {
    return true;
  }

  /*
   * Reuse epoch가 revokeFamily() 이전에 증가하면
   * Rotation 시작 시점과 완료 시점 epoch가 같을 수 있다.
   *
   * 이 경우에도 epoch > 0이면 동일 Family에서 Reuse Detection이
   * 확정된 상태이므로 방금 발급한 Token을 reconcile한다.
   */
  return reuseEpochAtRotationEnd > 0 && reuseEpochAtRotationEnd === reuseEpochAtRotationStart;
};

/**
 * ROTATED Refresh Token 재사용이 확인된 Token Family에 대해
 * reuse epoch를 즉시 증가시킨 뒤 Family revoke를 수행한다.
 *
 * epoch는 revokeFamily() 완료를 기다리기 전에 증가하여
 * revoke 완료 직후 Rotation이 끝나는 TOCTOU window에서
 * epoch 증가를 놓치지 않도록 한다.
 *
 * tryClearRefreshTokenFamilyReuseEpoch()는 Rotation in-flight 여부를 확인하여
 * 동시 Rotation reconcile이 epoch를 관측할 수 있게 유지한다.
 *
 * Reuse Detection 경로는 Family Serialization lock을 잡지 않아
 * R1 family revoke와 R2 rotation transaction이 interleave될 수 있다.
 */
export const handleRefreshTokenFamilyReuseDetection = async (
  sessionType: RefreshTokenSessionType,
  familyId: string,
  revokeFamily: () => Promise<unknown>,
): Promise<void> => {
  incrementRefreshTokenFamilyReuseEpoch(sessionType, familyId);

  try {
    await revokeFamily();
  } finally {
    tryClearRefreshTokenFamilyReuseEpoch(sessionType, familyId);
  }
};

/**
 * Token Family 단위 Rotation mutation을 직렬화한다.
 *
 * Rotation 시작 전 reuse epoch를 캡처하고,
 * Rotation transaction 완료 후 epoch가 증가했다면
 * Rotation 도중 Reuse Detection이 발생한 것으로 판단하여
 * 방금 발급한 Refresh Token(R3)을 revoke한다.
 *
 * reconcile은 revokeRefreshTokenByHash만 사용한다.
 * R1 reuse 경로에서 이미 revokeRefreshTokenFamily가 실행된 뒤
 * R3 insert가 늦게 완료되는 Race에서 Family revoke를 다시 호출하면
 * race reproduction 테스트의 interleave 순서와 충돌할 수 있다.
 *
 * runRefreshTokenSingleFlight(tokenHash)와 역할이 다르다.
 * - SingleFlight: 동일 sessionType + tokenHash 중복 실행 방지
 * - Family Rotation: 동일 sessionType + familyId Rotation 경쟁 방지
 *
 * Family Serialization / reuse epoch 저장소는 단일 Node.js 프로세스 메모리를 사용하므로
 * 다중 프로세스/인스턴스 환경에서는 프로세스/인스턴스 간 상태가 공유되지 않는다.
 */
export const runRefreshTokenFamilyRotation = async <T extends { refreshToken: string }>(
  sessionType: RefreshTokenSessionType,
  familyId: string,
  rotate: () => Promise<T>,
  reconcileIssuedRefreshTokenAfterReuseDetection: (
    issuedRefreshTokenHash: string,
  ) => Promise<unknown>,
): Promise<T> => {
  return runRefreshTokenFamilySerialization(
    sessionType,
    familyId,
    async () => {
      const reuseEpochAtRotationStart = getRefreshTokenFamilyReuseEpoch(sessionType, familyId);
      const result = await rotate();
      const reuseEpochAtRotationEnd = getRefreshTokenFamilyReuseEpoch(sessionType, familyId);

      if (shouldReconcileAfterRotation(reuseEpochAtRotationStart, reuseEpochAtRotationEnd)) {
        await reconcileIssuedRefreshTokenAfterReuseDetection(tokenHash(result.refreshToken));
      }

      return result;
    },
    () => {
      tryClearRefreshTokenFamilyReuseEpoch(sessionType, familyId);
    },
  );
};
