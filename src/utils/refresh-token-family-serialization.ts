import type { RefreshTokenSessionType } from "@prisma/client";

/**
 * 동일 Token Family에서 Reuse Detection과 Rotation이
 * 서로 다른 Refresh Token(R1/R2)으로 동시에 실행될 때
 * 발생하는 Race Condition을 방지하기 위한 in-flight 저장소.
 *
 * Key는 sessionType + familyId 조합만 사용하며
 * Refresh Token 원문이나 tokenHash는 저장하지 않는다.
 *
 * USER / ADMIN 세션이 서로 영향을 주지 않도록
 * sessionType을 Key에 함께 포함한다.
 *
 * 동일 Family에 속한 서로 다른 Token Hash의 Refresh 요청 중
 * 이미 진행 중인 Rotation mutation이 있으면
 * 새 요청은 별도 task를 실행하지 않고 기존 Promise 결과를 공유한다.
 *
 * runRefreshTokenSingleFlight(tokenHash)와 동일한 coalesce 패턴이며,
 * queue에 후속 task를 쌓아 순차 실행하지는 않는다.
 *
 * 현재 구현은 단일 Node.js 프로세스의 메모리를 사용하므로
 * 다중 프로세스 또는 다중 서버 환경에서는 Family 단위 직렬화가
 * 프로세스/인스턴스 간에 공유되지 않는다.
 */
const inFlightFamilyOperations = new Map<string, Promise<unknown>>();

/**
 * task() 호출 직전에 등록하여
 * task 동기 구간에서도 in-flight 여부를 올바르게 판별한다.
 */
const inFlightFamilyKeys = new Set<string>();

const buildFamilyKey = (sessionType: RefreshTokenSessionType, familyId: string): string =>
  `${sessionType}:${familyId}`;

/**
 * 동일 Token Family에 대한 Refresh mutation을 coalesce한다.
 *
 * familyId가 null인 Legacy Refresh Token은
 * Family 관계를 추적할 수 없으므로 호출하지 않는다.
 *
 * 동일 Key에 대한 동시 요청은 첫 번째 task의 Promise를 공유한다.
 * 성공 또는 실패 여부와 관계없이 leader task가 끝나면
 * in-flight 저장소에서 해당 Family 요청을 제거한다.
 */
export const runRefreshTokenFamilySerialization = async <T>(
  sessionType: RefreshTokenSessionType,
  familyId: string,
  task: () => Promise<T>,
  onReleased?: () => void,
): Promise<T> => {
  const key = buildFamilyKey(sessionType, familyId);

  const existingPromise = inFlightFamilyOperations.get(key);

  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  inFlightFamilyKeys.add(key);

  const promise = task();

  inFlightFamilyOperations.set(key, promise);

  try {
    return await promise;
  } finally {
    if (inFlightFamilyOperations.get(key) === promise) {
      inFlightFamilyOperations.delete(key);
    }
    inFlightFamilyKeys.delete(key);
    onReleased?.();
  }
};

/**
 * 동일 Token Family에 대한 Rotation mutation이
 * 현재 in-flight 상태인지 확인한다.
 *
 * Reuse Detection만 단독으로 끝난 경우 in-progress 표시를
 * 즉시 정리할지, Rotation reconcile에서 정리할지 판단할 때 사용한다.
 */
export const isRefreshTokenFamilyOperationInFlight = (
  sessionType: RefreshTokenSessionType,
  familyId: string,
): boolean => inFlightFamilyKeys.has(buildFamilyKey(sessionType, familyId));
