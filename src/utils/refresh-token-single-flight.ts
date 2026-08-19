import type { RefreshTokenSessionType } from "@prisma/client";

/**
 * 동일 Refresh Token으로 동시에 들어온 Refresh 요청의
 * 중복 실행을 방지하기 위한 in-flight 저장소.
 *
 * Refresh Token 원문은 메모리에 저장하지 않고
 * sessionType + tokenHash 조합만 Key로 사용한다.
 *
 * 현재 구현은 단일 Node.js 프로세스의 메모리를 사용하므로
 * 다중 프로세스 또는 다중 서버 환경에서는 공유되지 않는다.
 */
const inFlightRefreshRequests = new Map<string, Promise<unknown>>();

/**
 * 동일한 Refresh Token에 대한 Rotation이 이미 진행 중이면
 * 새로운 Rotation을 실행하지 않고 기존 Promise의 결과를 공유한다.
 *
 * USER / ADMIN 세션이 서로 영향을 주지 않도록
 * sessionType을 Key에 함께 포함한다.
 *
 * 성공 또는 실패 여부와 관계없이 작업이 끝나면
 * in-flight 저장소에서 해당 요청을 제거한다.
 */
export const runRefreshTokenSingleFlight = async <T>(
  sessionType: RefreshTokenSessionType,
  tokenHash: string,
  task: () => Promise<T>,
): Promise<T> => {
  const key = `${sessionType}:${tokenHash}`;

  const existingPromise = inFlightRefreshRequests.get(key);

  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  const promise = task();

  inFlightRefreshRequests.set(key, promise);

  try {
    return await promise;
  } finally {
    /**
     * 현재 Key에 등록된 Promise가 자신일 때만 제거한다.
     *
     * 이후 구현 변경으로 동일 Key에 다른 Promise가 등록되는 경우에도
     * 이전 작업의 finally가 새 작업을 삭제하지 않도록 방어한다.
     */
    if (inFlightRefreshRequests.get(key) === promise) {
      inFlightRefreshRequests.delete(key);
    }
  }
};
