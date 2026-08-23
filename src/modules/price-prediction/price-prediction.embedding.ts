import { env } from "../../config/env";
import { AppError } from "../../lib/app-error";

const MODEL = "gemini-embedding-001";
const OUTPUT_DIMENSION = 1536;

type GeminiEmbeddingResponse = { embedding: { values: number[] } };

function normalize(values: number[]) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? values : values.map((value) => value / norm);
}

export async function createPricePredictionEmbedding(content: string): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text: content }] },
        outputDimensionality: OUTPUT_DIMENSION,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();

    if (response.status === 429) {
      throw new AppError("TOO_MANY_REQUESTS", {
        message: "AI 예상 견적 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
        data: {
          provider: "Gemini",
          status: response.status,
        },
      });
    }

    throw new AppError("BAD_GATEWAY", {
      message: "AI 예상 견적 처리 중 외부 AI 서비스 오류가 발생했습니다.",
      data: {
        provider: "Gemini",
        status: response.status,
        detail,
      },
    });
  }

  const result = (await response.json()) as GeminiEmbeddingResponse;
  if (result.embedding.values.length !== OUTPUT_DIMENSION) {
    throw new Error(`Unexpected embedding dimension: ${result.embedding.values.length}`);
  }

  return normalize(result.embedding.values);
}
