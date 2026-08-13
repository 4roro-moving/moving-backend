/** KST(Asia/Seoul) 달력 날짜의 시작 시각을 UTC로 변환합니다. */
export function toKstStartOfDay(date: string): Date {
  const [year = NaN, month = NaN, day = NaN] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, -9));
}

/** KST(Asia/Seoul) 달력 날짜의 마지막 시각을 UTC로 변환합니다. */
export function toKstEndOfDay(date: string): Date {
  const [year = NaN, month = NaN, day = NaN] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, 14, 59, 59, 999));
}
