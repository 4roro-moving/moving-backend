import { env } from "../../config/env";
import logger from "../../config/logger";
import { AppError } from "../../lib/app-error";
import type { TranslateResponse } from "./translation.type";
import type { TranslateInput } from "./translation.validator";

const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";
const REQUEST_TIMEOUT_MS = 10_000;

type GoogleTranslationResponse = {
  data?: {
    translations?: Array<{
      translatedText?: string;
      detectedSourceLanguage?: string;
    }>;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

const decodeHtmlEntities = (value: string): string =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const translate = async ({ texts, targetLocale }: TranslateInput): Promise<TranslateResponse> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GOOGLE_TRANSLATE_URL}?key=${encodeURIComponent(env.GOOGLE_TRANSLATE_API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: texts,
          target: targetLocale,
          format: "text",
        }),
        signal: controller.signal,
      },
    );

    const payload = (await response.json().catch(() => ({}))) as GoogleTranslationResponse;

    if (!response.ok) {
      logger.error("Google Cloud Translation request failed", {
        status: response.status,
        detail: payload.error?.message,
      });

      throw new AppError("BAD_GATEWAY", {
        message: "번역 서비스와 통신 중 오류가 발생했습니다.",
      });
    }

    const translations = payload.data?.translations;

    if (!translations || translations.length !== texts.length) {
      logger.error("Google Cloud Translation response is invalid", {
        requestedCount: texts.length,
        responseCount: translations?.length ?? 0,
      });

      throw new AppError("BAD_GATEWAY", {
        message: "번역 서비스의 응답 형식이 올바르지 않습니다.",
      });
    }

    return {
      translations: translations.map((item) => decodeHtmlEntities(item.translatedText ?? "")),
      targetLocale,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      logger.error("Google Cloud Translation request timed out");

      throw new AppError("BAD_GATEWAY", {
        message: "번역 서비스 응답 시간이 초과되었습니다.",
      });
    }

    logger.error("Google Cloud Translation request failed", { error });

    throw new AppError("BAD_GATEWAY", {
      message: "번역 서비스와 통신 중 오류가 발생했습니다.",
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const translationService = { translate };
