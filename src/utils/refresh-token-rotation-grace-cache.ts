import type { RefreshTokenSessionType } from "@prisma/client";

import { env } from "../config/env";
import { refreshTokenRotationGraceMsSchema } from "../config/refresh-token-rotation-grace-ms.schema";

type GraceCacheEntry<T> = {
  result: T;
  expiresAt: number;
};

/**
 * Refresh Token 원문은 Cache Key에 저장하지 않고
 * sessionType + 기존 Refresh Token의 tokenHash만 Key로 사용한다.
 *
 * Rotation 성공 결과를 재응답해야 하므로
 * 새로 발급된 Refresh Token은 Grace TTL 동안 Cache Value에 일시적으로 보관된다.
 *
 * Grace Window를 짧게 유지하여
 * Refresh Token 원문의 메모리 보관 시간을 제한한다.
 *
 * TTL은 env 파싱 단계에서 검증된 값을 사용한다.
 * 다중 프로세스 또는 다중 서버 환경에서는 공유되지 않는다.
 */
const rotationGraceCache = new Map<string, GraceCacheEntry<unknown>>();

const startupGraceTtlRaw = process.env.REFRESH_TOKEN_ROTATION_GRACE_MS;

export const buildRefreshTokenRotationGraceCacheKey = (
  sessionType: RefreshTokenSessionType,
  tokenHash: string,
): string => `${sessionType}:${tokenHash}`;

export const getRefreshTokenRotationGraceTtlMs = (): number => {
  const currentRaw = process.env.REFRESH_TOKEN_ROTATION_GRACE_MS;

  if (currentRaw !== startupGraceTtlRaw) {
    return refreshTokenRotationGraceMsSchema.parse(currentRaw);
  }

  return env.REFRESH_TOKEN_ROTATION_GRACE_MS;
};

export const getRefreshTokenRotationGraceResult = <T>(
  sessionType: RefreshTokenSessionType,
  tokenHash: string,
): T | null => {
  const ttlMs = getRefreshTokenRotationGraceTtlMs();

  if (ttlMs === 0) {
    return null;
  }

  const key = buildRefreshTokenRotationGraceCacheKey(sessionType, tokenHash);
  const entry = rotationGraceCache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() >= entry.expiresAt) {
    rotationGraceCache.delete(key);
    return null;
  }

  return entry.result as T;
};

export const setRefreshTokenRotationGraceResult = <T>(
  sessionType: RefreshTokenSessionType,
  tokenHash: string,
  result: T,
): void => {
  const ttlMs = getRefreshTokenRotationGraceTtlMs();

  if (ttlMs === 0) {
    return;
  }

  const key = buildRefreshTokenRotationGraceCacheKey(sessionType, tokenHash);
  const expiresAt = Date.now() + ttlMs;

  rotationGraceCache.set(key, {
    result,
    expiresAt,
  });

  const timeout = setTimeout(() => {
    const currentEntry = rotationGraceCache.get(key);

    if (currentEntry !== undefined && Date.now() >= currentEntry.expiresAt) {
      rotationGraceCache.delete(key);
    }
  }, ttlMs);

  timeout.unref?.();
};

export const getRefreshTokenRotationGraceCacheSize = (): number => rotationGraceCache.size;

export const clearRefreshTokenRotationGraceCache = (): void => {
  rotationGraceCache.clear();
};
