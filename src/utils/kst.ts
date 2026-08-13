/**
 * KST(Asia/Seoul) 시간 처리 공용 유틸.
 *
 * ## 두 가지 개념을 구분합니다
 * - **Instant (시각)**: 실제로 일어난 순간. `createdAt`, `canceledAt`, `new Date()` 등.
 *   DB에 UTC로 저장되며, 타임존을 바꿔도 가리키는 순간은 같습니다.
 *
 * - **DateMarker (달력 날짜)**: 시각 개념이 없는 날짜. `moveDate` 등.
 *   관례상 "해당 날짜의 UTC 자정" Date 객체로 표현합니다.
 *   예) 2026-08-20 → `2026-08-20T00:00:00.000Z`
 *
 * 이 둘을 섞어서 같은 함수에 넘기면 9시간씩 어긋납니다.
 * 아래 함수들은 파라미터 이름으로 어느 쪽을 받는지 명시합니다.
 */

/** KST 고정 오프셋(밀리초). 한국 전용 가정. */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_MARKER_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 실제 시각이 KST 기준으로 며칠인지 구합니다.
 */

export function kstDateOf(instant: Date): Date {
  const shifted = new Date(instant.getTime() + KST_OFFSET_MS);

  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/**
 * KST 기준 오늘 날짜를 구합니다.
 */
export function kstToday(now: Date = new Date()): Date {
  return kstDateOf(now);
}

/**
 * 해당 달력 날짜가 KST에서 시작하는 순간을 구합니다.
 * "전날이 끝나는 순간"과 동일합니다.
 * @example
 * kstDayStart(marker("2026-08-20")) // → 2026-08-19T15:00:00.000Z
 */

export function kstDayStart(marker: Date): Date {
  return new Date(marker.getTime() - KST_OFFSET_MS);
}

/**
 * 해당 달력 날짜가 KST에서 끝나는 순간(23:59:59.999)을 구합니다.
 * 기간 조회의 상한(`lte`)으로 사용합니다.
 *
 * @example
 * kstDayEnd(marker("2026-08-20")) // → 2026-08-20T14:59:59.999Z
 */
export function kstDayEnd(marker: Date): Date {
  return new Date(kstDayStart(marker).getTime() + MS_PER_DAY - 1);
}

// =============================================================================
// 문자열 변환
// =============================================================================

/**
 * "YYYY-MM-DD" 문자열을 DateMarker로 변환합니다.
 * 존재하지 않는 날짜(2026-02-30 등)는 null을 반환하므로 호출측에서 검증해야 합니다.
 */
export function parseDateMarker(value: string): Date | null {
  if (!DATE_MARKER_PATTERN.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

/** DateMarker를 "YYYY-MM-DD" 문자열로 변환합니다. API 응답용. */
export function formatDateMarker(marker: Date): string {
  return marker.toISOString().slice(0, 10);
}

// =============================================================================
// 비교 헬퍼
// =============================================================================

/** 달력 날짜가 KST 기준 오늘보다 과거인지 확인합니다. */

export function compareDateMarkers(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}

export function isPastInKst(marker: Date, now: Date = new Date()): boolean {
  return compareDateMarkers(marker, kstToday(now)) < 0;
}
