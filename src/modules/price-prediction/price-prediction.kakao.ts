import { env } from "../../config/env";
import type { RouteDistanceInput, RouteDistanceResult } from "./price-prediction.type";

const KAKAO_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";

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

export async function getKakaoRouteDistance({
  origin,
  destination,
}: RouteDistanceInput): Promise<RouteDistanceResult> {
  const url = new URL(KAKAO_DIRECTIONS_URL);

  url.searchParams.set("origin", `${origin.longitude},${origin.latitude}`);

  url.searchParams.set("destination", `${destination.longitude},${destination.latitude}`);

  url.searchParams.set("priority", "RECOMMEND");
  url.searchParams.set("summary", "true");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `KakaoAK ${env.KAKAO_CLIENT_ID}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(
      `Kakao Mobility directions request failed (${String(response.status)}): ${detail}`,
    );
  }

  const data = (await response.json()) as KakaoDirectionsResponse;

  const route = data.routes?.[0];

  if (!route) {
    throw new Error("Kakao Mobility directions response does not contain a route.");
  }

  if (route.result_code !== 0 || !route.summary) {
    throw new Error(`Kakao Mobility directions failed: ${route.result_msg}`);
  }

  const distanceMeters = route.summary.distance;

  return {
    distanceMeters,
    distanceKm: Math.max(1, Math.round(distanceMeters / 1000)),
    durationSeconds: route.summary.duration,
  };
}
