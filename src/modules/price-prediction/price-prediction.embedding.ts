import { env } from "../../config/env";
import logger from "../../config/logger";
import { AppError } from "../../lib/app-error";

const MODEL = "gemini-embedding-001";
const OUTPUT_DIMENSION = 1536;
const GEMINI_FETCH_TIMEOUT_MS = 10_000;

type GeminiEmbeddingResponse = { embedding: { values: number[] } };

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

function getErrorLog(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: "알 수 없는 오류가 발생했습니다." };
}

function getEmbeddingValues(response: unknown): unknown {
  if (!response || typeof response !== "object") return undefined;

  const embedding = (response as { embedding?: unknown }).embedding;

  if (!embedding || typeof embedding !== "object") return undefined;

  return (embedding as { values?: unknown }).values;
}

function isValidEmbeddingResponse(response: unknown): response is GeminiEmbeddingResponse {
  const values = getEmbeddingValues(response);

  return (
    Array.isArray(values) &&
    values.length === OUTPUT_DIMENSION &&
    values.every((value) => typeof value === "number" && Number.isFinite(value))
  );
}

function normalize(values: number[]) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? values : values.map((value) => value / norm);
}

export async function createPricePredictionEmbedding(content: string): Promise<number[]> {
  let response: Response;

  try {
    response = await fetch(
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
        signal: AbortSignal.timeout(GEMINI_FETCH_TIMEOUT_MS),
      },
    );
  } catch (error: unknown) {
    logger.error("[Price Prediction] Gemini embedding request failed.", {
      error: getErrorLog(error),
    });

    throw new AppError("BAD_GATEWAY", {
      message: isTimeoutError(error)
        ? "AI 예상 견적 서비스의 응답 시간이 초과되었습니다."
        : "AI 예상 견적 서비스에 연결할 수 없습니다.",
    });
  }

  if (!response.ok) {
    const detail = await response.text();

    logger.error("[Price Prediction] Gemini embedding response failed.", {
      status: response.status,
      detail,
    });

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
      },
    });
  }

  let result: unknown;

  try {
    result = await response.json();
  } catch (error: unknown) {
    logger.error("[Price Prediction] Gemini embedding response JSON parsing failed.", {
      status: response.status,
      error: getErrorLog(error),
    });

    throw new AppError("BAD_GATEWAY", {
      message: "AI 예상 견적 서비스의 응답을 처리할 수 없습니다.",
    });
  }

  if (!isValidEmbeddingResponse(result)) {
    const embeddingValues = getEmbeddingValues(result);

    logger.error("[Price Prediction] Gemini embedding response validation failed.", {
      status: response.status,
      dimension: Array.isArray(embeddingValues) ? embeddingValues.length : undefined,
    });

    throw new AppError("BAD_GATEWAY", {
      message: "AI 예상 견적 서비스의 응답 형식이 올바르지 않습니다.",
    });
  }

  return normalize(result.embedding.values);
}
