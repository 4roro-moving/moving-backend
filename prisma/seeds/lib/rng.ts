/*
 * 결정적 난수 생성기 (mulberry32)
 *
 * 시드를 고정하면 몇 번을 실행해도 같은 데이터가 나온다.
 * Math.random() 은 절대 쓰지 않는다 — 재현 불가능해지고,
 * "어제 시드에서 보이던 그 계정"을 다시 찾을 수 없게 된다.
 */

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;

  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 이름 있는 하위 스트림을 만든다.
 *
 * 생성기마다 독립된 RNG 를 쓰게 하면, 한 생성기의 호출 횟수가 바뀌어도
 * 다른 생성기 결과가 흔들리지 않는다.
 */
export function deriveRng(masterSeed: number, streamName: string): Rng {
  let hash = 0x811c9dc5;

  for (let i = 0; i < streamName.length; i += 1) {
    hash ^= streamName.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return makeRng((masterSeed ^ hash) >>> 0);
}

export function randInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("빈 배열에서 원소를 뽑을 수 없습니다.");
  }

  return items[Math.floor(rng() * items.length)] as T;
}

export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}

/** 배열을 결정적으로 섞는다 (Fisher-Yates). 원본은 건드리지 않는다. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }

  return result;
}

/**
 * 중복 없이 n 개를 뽑는다.
 *
 * 모집단이 크고 n 이 작을 때 shuffled() 전체 복사는 낭비라
 * 거부 샘플링으로 처리한다.
 */
export function sampleIndices(rng: Rng, populationSize: number, n: number): number[] {
  const count = Math.min(n, populationSize);

  if (count > populationSize / 3) {
    return shuffled(
      rng,
      Array.from({ length: populationSize }, (_, i) => i),
    ).slice(0, count);
  }

  const chosen = new Set<number>();

  while (chosen.size < count) {
    chosen.add(Math.floor(rng() * populationSize));
  }

  return [...chosen];
}
