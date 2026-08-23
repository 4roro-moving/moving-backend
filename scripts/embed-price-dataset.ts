import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const apiKey = process.env.GEMINI_API_KEY;
const MODEL = "gemini-embedding-001";
const OUTPUT_DIMENSION = 1536;
const FETCH_SIZE = 20;
const REQUEST_SIZE = 20;
const DELAY_MS = 1200;
const MAX_RETRIES = 5;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY가 없습니다.");
}

type PendingRow = {
  id: bigint;
  content: string;
};

type BatchEmbeddingResponse = {
  embeddings?: Array<{
    values: number[];
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));

  if (norm === 0) {
    return values;
  }

  return values.map((value) => value / norm);
}

async function createBatchEmbeddings(texts: string[], attempt = 0): Promise<number[][]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${MODEL}`,
          content: {
            parts: [{ text }],
          },
          outputDimensionality: OUTPUT_DIMENSION,
        })),
      }),
    },
  );

  if (response.status === 429 || response.status >= 500) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(
        `Gemini 재시도 한도를 초과했습니다: ${response.status} ${await response.text()}`,
      );
    }

    const waitMs = Math.min(60_000, 2 ** attempt * 5_000);
    console.warn(`Gemini ${response.status} - ${Math.round(waitMs / 1000)}초 후 재시도`);
    await sleep(waitMs);

    return createBatchEmbeddings(texts, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`Gemini 오류 ${response.status}: ${await response.text()}`);
  }

  const result = (await response.json()) as BatchEmbeddingResponse;

  if (!result.embeddings || result.embeddings.length !== texts.length) {
    throw new Error(
      `Embedding 개수가 일치하지 않습니다. 요청 ${texts.length}, 응답 ${result.embeddings?.length ?? 0}`,
    );
  }

  // gemini-embedding-001은 3072보다 작은 차원을 요청할 경우
  // 직접 L2 normalization 하는 것을 Google이 권장합니다.
  return result.embeddings.map((embedding) => normalize(embedding.values));
}

async function saveEmbedding(id: bigint, embedding: number[]) {
  const vector = `[${embedding.join(",")}]`;

  await prisma.$executeRawUnsafe(
    `
      UPDATE price_prediction_vectors
      SET embedding = $1::vector
      WHERE id = $2
    `,
    vector,
    id,
  );
}

async function getCounts() {
  const result = await prisma.$queryRawUnsafe<
    { total: bigint; embedded: bigint; pending: bigint }[]
  >(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(embedding)::bigint AS embedded,
      COUNT(*) FILTER (WHERE embedding IS NULL)::bigint AS pending
    FROM price_prediction_vectors
  `);

  return result[0];
}

async function main() {
  const before = await getCounts();

  console.log(
    `시작: 전체 ${before.total.toString()} / 완료 ${before.embedded.toString()} / 남음 ${before.pending.toString()}`,
  );

  let processedThisRun = 0;

  while (true) {
    const rows = await prisma.$queryRawUnsafe<PendingRow[]>(
      `
        SELECT id, content
        FROM price_prediction_vectors
        WHERE embedding IS NULL
        ORDER BY id
        LIMIT $1
      `,
      FETCH_SIZE,
    );

    if (rows.length === 0) {
      break;
    }

    for (let i = 0; i < rows.length; i += REQUEST_SIZE) {
      const chunk = rows.slice(i, i + REQUEST_SIZE);
      const embeddings = await createBatchEmbeddings(chunk.map((row) => row.content));

      for (let j = 0; j < chunk.length; j += 1) {
        await saveEmbedding(chunk[j].id, embeddings[j]);
      }

      processedThisRun += chunk.length;

      const counts = await getCounts();

      console.log(
        `진행: ${counts.embedded.toString()} / ${counts.total.toString()} ` +
          `(이번 실행 +${processedThisRun}, 남음 ${counts.pending.toString()})`,
      );

      await sleep(DELAY_MS);
    }
  }

  const after = await getCounts();

  console.log("");
  console.log("=== 완료 ===");
  console.log(`전체: ${after.total.toString()}`);
  console.log(`Embedding 완료: ${after.embedded.toString()}`);
  console.log(`남음: ${after.pending.toString()}`);
}

main()
  .catch((error) => {
    console.error("");
    console.error("Embedding 작업 중단:");
    console.error(error);
    console.error("");
    console.error("다시 실행하면 embedding IS NULL인 행부터 이어서 처리합니다.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
