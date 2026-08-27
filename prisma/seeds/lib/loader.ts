/*
 * 대량 적재 유틸
 *
 * 전체를 하나의 $transaction 으로 감싸지 않는다. 15만 요청 + 50만 견적을
 * 한 트랜잭션에 넣으면 timeout(P2028)이 거의 확실하고, 실패 시 롤백에도
 * 그만큼의 시간이 든다.
 *
 * 멱등성은 트랜잭션이 아니라 "시작할 때 전부 비우고 다시 넣는다"로 확보한다.
 * (truncateAll 참고)
 */

import { Prisma, type PrismaClient } from "@prisma/client";

type SequenceClient = {
  $executeRawUnsafe: PrismaClient["$executeRawUnsafe"];
};

/** createMany 한 번에 보낼 행 수. Postgres 파라미터 한도를 고려한 값. */
export const CHUNK_SIZE = 5_000;

export function chunk<T>(items: readonly T[], size = CHUNK_SIZE): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
}

/** 제너레이터를 청크 단위로 모아준다. 전체 배열을 메모리에 올리지 않는다. */
export function* chunkedFrom<T>(source: Iterable<T>, size = CHUNK_SIZE): Generator<T[]> {
  let buffer: T[] = [];

  for (const item of source) {
    buffer.push(item);

    if (buffer.length >= size) {
      yield buffer;
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    yield buffer;
  }
}

function formatCount(n: number): string {
  return n.toLocaleString("ko-KR");
}

/**
 * 청크로 나눠 createMany 하고 진행률을 찍는다.
 *
 * delegate 는 prisma.<model> 을 그대로 넘긴다.
 */
export async function loadMany<T>(
  label: string,
  delegate: { createMany: (args: { data: T[]; skipDuplicates?: boolean }) => Promise<unknown> },
  rows: readonly T[] | Iterable<T>,
  options: { skipDuplicates?: boolean; total?: number } = {},
): Promise<number> {
  const startedAt = Date.now();
  let inserted = 0;
  let lastLoggedAt = startedAt;

  const total = options.total ?? (Array.isArray(rows) ? rows.length : undefined);

  for (const part of chunkedFrom(rows as Iterable<T>)) {
    await delegate.createMany(
      options.skipDuplicates === undefined
        ? { data: part }
        : { data: part, skipDuplicates: options.skipDuplicates },
    );

    inserted += part.length;

    // 3초에 한 번만 진행률을 찍는다(로그 폭주 방지)
    const now = Date.now();

    if (now - lastLoggedAt > 3_000) {
      const suffix = total ? ` / ${formatCount(total)}` : "";
      console.log(`     … ${label} ${formatCount(inserted)}${suffix}`);
      lastLoggedAt = now;
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`  ✅ ${label} ${formatCount(inserted)}건 (${elapsed}s)`);

  return inserted;
}

/**
 * 시드 대상 테이블을 전부 비운다.
 *
 * TRUNCATE ... RESTART IDENTITY CASCADE 는 DELETE 보다 훨씬 빠르고
 * 시퀀스도 함께 초기화된다. CASCADE 라 FK 순서도 신경 쓸 필요가 없다.
 *
 * ── 목록을 손으로 적지 않는 이유 ──────────────────────────────────────
 * 이 스키마는 대부분 @@map 으로 snake_case 테이블명을 쓰지만,
 * User 와 RefreshToken 두 모델에는 @@map 이 없어서 실제 테이블명이
 * PascalCase("User", "RefreshToken") 다.
 * 목록을 하드코딩하면 이런 예외를 놓치고, 모델이 추가될 때마다 또 어긋난다.
 * 그래서 Prisma 가 들고 있는 DMMF 에서 실제 테이블명을 그대로 읽는다.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  console.log("🧹 기존 데이터를 전부 비웁니다 (TRUNCATE CASCADE)");

  const tables = Prisma.dmmf.datamodel.models.map((model) => model.dbName ?? model.name);

  if (tables.length === 0) {
    throw new Error("Prisma DMMF 에서 모델을 찾지 못했습니다. prisma generate 를 실행하세요.");
  }

  const list = tables.map((table) => `"${table}"`).join(", ");

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);

  console.log(`  ✅ ${tables.length}개 테이블`);
}

/**
 * Int autoincrement PK 테이블의 시퀀스를 max(id) 로 맞춘다.
 *
 * 시드가 id 를 직접 넣기 때문에 시퀀스는 여전히 1 을 가리킨다.
 * 이걸 빠뜨리면 시드 직후 앱의 첫 INSERT 가 id=1 로 시도되어 unique 위반이 난다.
 * 증상이 "가입은 되는데 견적 요청만 실패" 처럼 엉뚱하게 나타나 원인 찾기가 어렵다.
 *
 * 대상도 DMMF 에서 뽑는다 — 목록을 손으로 관리하면 모델 추가 시 또 어긋난다.
 */
export async function syncSequences(prisma: SequenceClient): Promise<void> {
  const targets = Prisma.dmmf.datamodel.models.filter((model) =>
    model.fields.some(
      (field) =>
        field.isId &&
        field.type === "Int" &&
        typeof field.default === "object" &&
        field.default !== null &&
        "name" in field.default &&
        field.default.name === "autoincrement",
    ),
  );

  console.log(`🔢 시퀀스를 현재 최대 id 로 맞춥니다 (${targets.length}개 테이블)`);

  for (const model of targets) {
    const table = model.dbName ?? model.name;
    const idField = model.fields.find((field) => field.isId);
    const idColumn = idField?.dbName ?? idField?.name ?? "id";

    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"${table}"', '${idColumn}'),
        COALESCE((SELECT MAX("${idColumn}") FROM "${table}"), 1),
        (SELECT MAX("${idColumn}") IS NOT NULL FROM "${table}")
      )
    `);
  }

  console.log("  ✅ 완료");
}

/** 적재 후 통계 갱신. 없으면 플랜이 엉망이 되어 "느리다"고 오진하게 된다. */
export async function analyze(prisma: PrismaClient): Promise<void> {
  console.log("📊 ANALYZE 실행");
  await prisma.$executeRawUnsafe("ANALYZE");
  console.log("  ✅ 완료");
}
