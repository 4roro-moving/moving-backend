import type { RefreshTokenSessionType } from "@prisma/client";

import { isRefreshTokenFamilyOperationInFlight } from "./refresh-token-family-serialization";

/**
 * Token Family별 Reuse Detection epoch 저장소.
 *
 * Key   : `${sessionType}:${familyId}`
 * Value : 1 이상의 정수 epoch (Reuse Detection이 발생할 때마다 증가)
 *
 * Refresh Token 원문이나 tokenHash는 저장하지 않는다.
 * USER / ADMIN 세션은 sessionType으로 격리되며,
 * 서로 다른 familyId도 별도 Key로 관리된다.
 *
 * Rotation 시작 시점 epoch와 완료 시점 epoch를 비교하여
 * Rotation 도중 Reuse Detection이 발생했는지 판단한다.
 *
 * epoch 항목은 Rotation in-flight가 없을 때 제거하여
 * Map에 Family Key가 무한히 누적되지 않도록 한다.
 *
 * 현재 Map은 단일 Node.js 프로세스 메모리에만 존재하므로
 * 다중 프로세스/인스턴스 환경에서는 epoch가 프로세스 간 공유되지 않는다.
 */
const familyReuseEpochs = new Map<string, number>();

export const buildRefreshTokenFamilyReuseEpochKey = (
  sessionType: RefreshTokenSessionType,
  familyId: string,
): string => `${sessionType}:${familyId}`;

export const getRefreshTokenFamilyReuseEpoch = (
  sessionType: RefreshTokenSessionType,
  familyId: string,
): number =>
  familyReuseEpochs.get(buildRefreshTokenFamilyReuseEpochKey(sessionType, familyId)) ?? 0;

export const incrementRefreshTokenFamilyReuseEpoch = (
  sessionType: RefreshTokenSessionType,
  familyId: string,
): number => {
  const key = buildRefreshTokenFamilyReuseEpochKey(sessionType, familyId);
  const nextEpoch = (familyReuseEpochs.get(key) ?? 0) + 1;
  familyReuseEpochs.set(key, nextEpoch);
  return nextEpoch;
};

/**
 * Rotation in-flight가 없을 때만 epoch 항목을 제거한다.
 *
 * Reuse Detection만 단독으로 끝난 경우,
 * Rotation reconcile이 끝난 경우,
 * 예외 발생 후 Family Serialization lock이 해제된 경우에 호출한다.
 */
export const tryClearRefreshTokenFamilyReuseEpoch = (
  sessionType: RefreshTokenSessionType,
  familyId: string,
): void => {
  if (!isRefreshTokenFamilyOperationInFlight(sessionType, familyId)) {
    familyReuseEpochs.delete(buildRefreshTokenFamilyReuseEpochKey(sessionType, familyId));
  }
};

/** 테스트 및 진단용: 현재 epoch Map 크기 */
export const getRefreshTokenFamilyReuseEpochStoreSize = (): number => familyReuseEpochs.size;
