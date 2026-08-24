import { env } from "../../config/env";
import logger from "../../config/logger";
import { AppError } from "../../lib/app-error";
import type { RouteDistanceInput, RouteDistanceResult } from "./price-prediction.type";

const KAKAO_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";
const KAKAO_FETCH_TIMEOUT_MS = 10_000;

type KakaoDirectionsResponse = {
  routes?: Array<{
    result_code: number;
    result_msg: string;
    summary?: {
      distance: number;
      duration: number;
    };
  }>;
};

function isKakaoDirectionsResponse(value: unknown): value is KakaoDirectionsResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { routes?: unknown }).routes)
  );
}

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

export async function getKakaoRouteDistance({
  origin,
  destination,
}: RouteDistanceInput): Promise<RouteDistanceResult> {
  const url = new URL(KAKAO_DIRECTIONS_URL);

  url.searchParams.set("origin", `${origin.longitude},${origin.latitude}`);

  url.searchParams.set("destination", `${destination.longitude},${destination.latitude}`);

  url.searchParams.set("priority", "RECOMMEND");
  url.searchParams.set("summary", "true");

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `KakaoAK ${env.KAKAO_CLIENT_ID}`,
      },
      signal: AbortSignal.timeout(KAKAO_FETCH_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    logger.error("[Price Prediction] Kakao Mobility directions request failed.", {
      error: getErrorLog(error),
    });

    throw new AppError("BAD_GATEWAY", {
      message: isTimeoutError(error)
        ? "이동 거리 서비스의 응답 시간이 초과되었습니다."
        : "이동 거리 서비스에 연결할 수 없습니다.",
    });
  }

  if (!response.ok) {
    const detail = await response.text();

    logger.error("[Price Prediction] Kakao Mobility directions response failed.", {
      status: response.status,
      detail,
    });

    throw new AppError("BAD_GATEWAY", {
      message: "이동 거리 서비스에서 오류가 발생했습니다.",
      data: {
        provider: "Kakao Mobility",
        status: response.status,
      },
    });
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch (error: unknown) {
    logger.error("[Price Prediction] Kakao Mobility response JSON parsing failed.", {
      status: response.status,
      error: getErrorLog(error),
    });

    throw new AppError("BAD_GATEWAY", {
      message: "이동 거리 서비스의 응답을 처리할 수 없습니다.",
    });
  }

  if (!isKakaoDirectionsResponse(data)) {
    logger.error("[Price Prediction] Kakao Mobility response validation failed.", {
      status: response.status,
    });

    throw new AppError("BAD_GATEWAY", {
      message: "이동 거리 서비스의 응답 형식이 올바르지 않습니다.",
    });
  }

  const route = data.routes[0];

  if (!route || typeof route.result_code !== "number") {
    logger.error("[Price Prediction] Kakao Mobility response validation failed.", {
      status: response.status,
    });

    throw new AppError("BAD_GATEWAY", {
      message: "이동 거리 서비스의 응답 형식이 올바르지 않습니다.",
    });
  }

  if (route.result_code !== 0) {
    logger.warn("[Price Prediction] Kakao Mobility could not find a route.", {
      resultCode: route.result_code,
      resultMessage: route.result_msg,
    });

    throw new AppError("BAD_REQUEST", {
      message: "출발지와 도착지 사이의 차량 이동 경로를 찾을 수 없습니다.",
    });
  }

  if (!route.summary) {
    logger.error("[Price Prediction] Kakao Mobility route summary validation failed.", {
      status: response.status,
    });

    throw new AppError("BAD_GATEWAY", {
      message: "이동 거리 서비스의 응답 형식이 올바르지 않습니다.",
    });
  }

  const distanceMeters = route.summary.distance;
  const durationSeconds = route.summary.duration;

  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0
  ) {
    logger.error("[Price Prediction] Kakao Mobility route summary validation failed.", {
      distanceMeters,
      durationSeconds,
    });

    throw new AppError("BAD_GATEWAY", {
      message: "이동 거리 서비스의 응답 형식이 올바르지 않습니다.",
    });
  }

  return {
    distanceMeters,
    // 예상 견적 입력 계약은 0보다 큰 거리만 허용하므로 동일 좌표도 최소 1km로 보정한다.
    distanceKm: Math.max(1, Math.round(distanceMeters / 1000)),
    durationSeconds,
  };
}
