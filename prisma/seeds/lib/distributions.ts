/*
 * 실사용자에 가까운 분포를 만들기 위한 유틸.
 *
 * 균등 분포로 데이터를 채우면 규모만 클 뿐 실제 서비스와 다른 데이터가 된다.
 * 여기 있는 함수들이 "소수의 헤비 유저", "5점에 몰린 평점", "수도권 편중",
 * "봄·가을 성수기" 같은 실제 형태를 만들어낸다.
 */

import { HISTORY_MONTHS, MONTH_WEIGHTS, RATING_WEIGHTS } from "../config.js";
import { randInt, type Rng } from "./rng.js";

/** 가중치 기반 선택. weights 합이 1 이 아니어도 된다. */
export function weightedPick<T extends string | number>(
  rng: Rng,
  weights: Record<T, number> | ReadonlyArray<number>,
): T {
  const entries: [T, number][] = Array.isArray(weights)
    ? (weights as readonly number[]).map((w, i) => [i as T, w])
    : (Object.entries(weights as Record<string, number>) as [T, number][]);

  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let threshold = rng() * total;

  for (const [key, weight] of entries) {
    threshold -= weight;

    if (threshold <= 0) {
      return key;
    }
  }

  return entries[entries.length - 1]![0];
}

/** 평점 J커브. 1~5 정수를 돌려준다. */
export function pickRating(rng: Rng): number {
  return (weightedPick<number>(rng, RATING_WEIGHTS) as number) + 1;
}

/**
 * 파레토(멱함수) 분포로 "개수"를 뽑는다.
 *
 * zeroRatio 비율은 0 을 돌려준다(신규 가입 후 활동 없는 계정).
 * 나머지는 min~max 사이에서 작은 값 쪽으로 크게 치우친다.
 *
 * alpha 가 클수록 더 가파르다(=대부분 min 근처).
 */
export function paretoCount(
  rng: Rng,
  {
    min,
    max,
    alpha = 1.6,
    zeroRatio = 0,
  }: { min: number; max: number; alpha?: number; zeroRatio?: number },
): number {
  if (zeroRatio > 0 && rng() < zeroRatio) {
    return 0;
  }

  const u = Math.max(rng(), 1e-9);
  const raw = min / Math.pow(u, 1 / alpha);

  return Math.min(max, Math.max(min, Math.round(raw)));
}

/**
 * 합계를 정확히 맞추면서 파레토 형태로 분배한다.
 *
 * 예: 요청 155,000 건을 고객 30,000 명에게 나눠줄 때
 * 균등하게 5건씩이 아니라 "대부분 1~3건, 소수가 수십 건" 형태로 만들되
 * 총합은 정확히 155,000 이 되어야 한다.
 */
export function allocatePareto(
  rng: Rng,
  bucketCount: number,
  total: number,
  {
    alpha = 1.5,
    zeroRatio = 0,
    max = Number.POSITIVE_INFINITY,
    weightScale,
  }: {
    alpha?: number;
    zeroRatio?: number;
    /** 버킷 하나가 가질 수 있는 상한. 실서비스에서 한 고객이 이사를 1,000번 하지는 않는다. */
    max?: number;
    /** 버킷별 추가 가중치(0~1). 예: 가입 기간이 짧으면 이력도 적어야 한다. */
    weightScale?: (index: number) => number;
  } = {},
): number[] {
  const weights = new Array<number>(bucketCount);
  let weightSum = 0;

  for (let i = 0; i < bucketCount; i += 1) {
    const base =
      zeroRatio > 0 && rng() < zeroRatio ? 0 : 1 / Math.pow(Math.max(rng(), 1e-9), 1 / alpha);

    const w = base * (weightScale ? weightScale(i) : 1);
    weights[i] = w;
    weightSum += w;
  }

  if (weightSum === 0) {
    weights[0] = 1;
    weightSum = 1;
  }

  const result = new Array<number>(bucketCount).fill(0);
  let assigned = 0;

  for (let i = 0; i < bucketCount; i += 1) {
    const share = Math.min(max, Math.floor((weights[i]! / weightSum) * total));
    result[i] = share;
    assigned += share;
  }

  /*
   * 내림과 상한 때문에 남은 잔여분을 배분한다.
   * 상한에 걸리지 않은 버킷에만 나눠야 총합이 정확히 total 이 된다.
   */
  let remainder = total - assigned;

  const order = Array.from({ length: bucketCount }, (_, i) => i).sort(
    (a, b) => weights[b]! - weights[a]!,
  );

  let cursor = 0;
  let stuck = 0;

  while (remainder > 0 && stuck < bucketCount) {
    const target = order[cursor % bucketCount]!;
    cursor += 1;

    if (result[target]! >= max) {
      stuck += 1;
      continue;
    }

    result[target] = result[target]! + 1;
    remainder -= 1;
    stuck = 0;
  }

  return result;
}

/* ── 시간축 ───────────────────────────────────────────────────────────── */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * MS_PER_DAY);
}

export function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

/** 날짜만 남기고 시각을 0 으로 (Prisma @db.Date 컬럼용) */
export function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * 과거 HISTORY_MONTHS 기간 안에서 계절성을 반영한 날짜를 뽑는다.
 *
 * 이사는 봄·가을에 몰리므로 MONTH_WEIGHTS 를 적용한다.
 * 균등 분포로 뽑으면 대시보드 월별 차트가 평평해져서 실서비스처럼 안 보인다.
 */
export function pickSeasonalPastDate(rng: Rng, now: Date, maxMonthsAgo = HISTORY_MONTHS): Date {
  const monthsAgo = randInt(rng, 0, maxMonthsAgo - 1);
  const target = new Date(now);
  target.setUTCMonth(target.getUTCMonth() - monthsAgo);

  /*
   * 해당 월의 가중치로 재추첨(rejection sampling).
   * 최대 4회만 시도하고, 실패하면 그대로 쓴다(무한 루프 방지).
   */
  const maxWeight = Math.max(...MONTH_WEIGHTS);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const weight = MONTH_WEIGHTS[target.getUTCMonth()]!;

    if (rng() <= weight / maxWeight) {
      break;
    }

    const shift = randInt(rng, 0, maxMonthsAgo - 1);
    target.setUTCMonth(target.getUTCMonth() - (shift - monthsAgo));
  }

  const daysInMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  target.setUTCDate(randInt(rng, 1, daysInMonth));
  target.setUTCHours(randInt(rng, 8, 21), randInt(rng, 0, 59), randInt(rng, 0, 59), 0);

  // 미래로 넘어가지 않도록 보정
  return target.getTime() > now.getTime()
    ? new Date(now.getTime() - randInt(rng, 1, 30) * MS_PER_DAY)
    : target;
}

/** 지금부터 minDays~maxDays 뒤의 미래 날짜 */
export function pickFutureDate(rng: Rng, now: Date, minDays: number, maxDays: number): Date {
  const date = addDays(now, randInt(rng, minDays, maxDays));
  date.setUTCHours(randInt(rng, 8, 20), randInt(rng, 0, 59), 0, 0);

  return date;
}
