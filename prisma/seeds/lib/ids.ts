/*
 * ID 사전 배정
 * ============================================================================
 *
 *  이 시드 재작성의 핵심.
 *
 *  기존 시드는 createMany 로 넣은 뒤 fromDetailAddress 같은 값으로 되조회해서
 *  PK 를 복원했다. 그래서 (1) 생성분 전량을 Node 메모리에 올려야 했고
 *  (2) 왕복이 늘어 느렸으며 (3) 역매핑 키가 유일하지 않으면 조용히 깨졌다.
 *
 *  여기서는 PK 를 넣기 전에 정한다.
 *    - User    : UUID 를 Node 에서 생성 (v7)
 *    - 나머지  : Int 를 명시적으로 배정하고, 마지막에 시퀀스를 setval 로 맞춤
 *
 *  덕분에 FK 를 조립할 때 DB 를 다시 볼 필요가 전혀 없다.
 * ============================================================================
 */

import type { Rng } from "./rng.js";

/**
 * UUIDv7 생성 (결정적).
 *
 * 표준 v7 은 랜덤 비트를 쓰지만, 여기서는 재현성을 위해 시드 RNG 로 채운다.
 * 상위 48비트가 타임스탬프라 시간순으로 정렬되고, 그 덕에 PK 인덱스 삽입이
 * append-only 에 가까워져 대량 적재가 빨라진다.
 * (PostgreSQL 18 의 uuidv7() 을 쓰지 않는 이유: DB 가 만들면 값을 되조회해야 한다)
 */
export function makeUuidV7(rng: Rng, timestampMs: number): string {
  const bytes = new Uint8Array(16);

  // 48-bit timestamp (big-endian)
  const ts = Math.floor(timestampMs);
  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts / 2 ** 24) & 0xff;
  bytes[3] = (ts / 2 ** 16) & 0xff;
  bytes[4] = (ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;

  for (let i = 6; i < 16; i += 1) {
    bytes[i] = Math.floor(rng() * 256);
  }

  // version 7
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // variant RFC 4122
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex: string[] = [];

  for (let i = 0; i < 16; i += 1) {
    hex.push(bytes[i]!.toString(16).padStart(2, "0"));
  }

  const s = hex.join("");

  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * Int PK 순번 발급기.
 *
 * 테이블마다 하나씩 만들어 쓰고, 적재가 끝나면 currentValue() 로
 * 시퀀스를 setval 한다.
 */
export class IntIdAllocator {
  private next: number;

  constructor(
    private readonly tableName: string,
    start = 1,
  ) {
    this.next = start;
  }

  /** 다음 id 하나 */
  take(): number {
    const id = this.next;
    this.next += 1;

    return id;
  }

  /** 연속된 id n 개 (시작값 반환) */
  takeRange(n: number): number {
    const start = this.next;
    this.next += n;

    return start;
  }

  /** 지금까지 발급한 마지막 id. 아무것도 안 줬으면 0. */
  currentValue(): number {
    return this.next - 1;
  }

  get table(): string {
    return this.tableName;
  }
}
