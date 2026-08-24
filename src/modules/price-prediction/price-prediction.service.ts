import { AppError } from "../../lib/app-error";
import { createPricePredictionEmbedding } from "./price-prediction.embedding";
import {
  calculatePricePrediction,
  rankPricePredictionCandidates,
} from "./price-prediction.ranking";
import { pricePredictionRepository } from "./price-prediction.repository";
import type {
  PreparedPredictionInput,
  PricePredictionInput,
  PricePredictionResult,
  RouteDistanceInput,
  RouteDistanceResult,
} from "./price-prediction.type";

import { getKakaoRouteDistance } from "./price-prediction.kakao";

const PEAK_MONTHS = new Set([2, 3, 8, 9, 12]);

function prepareInput(input: PricePredictionInput): PreparedPredictionInput {
  const moveDate = new Date(`${input.moveDate}T00:00:00+09:00`);
  return {
    ...input,
    // KST 자정을 UTC로 해석한 뒤 UTC getter로 KST 달력 날짜를 일관되게 판정한다.
    isWeekend: moveDate.getUTCDay() === 0 || moveDate.getUTCDay() === 6,
    isPeakSeason: PEAK_MONTHS.has(moveDate.getUTCMonth() + 1),
  };
}

function createSearchContent(input: PreparedPredictionInput) {
  const moveTypeLabel = { SMALL: "소형/원룸 이사", HOME: "가정 이사", OFFICE: "사무실 이사" }[
    input.moveType
  ];
  const loadAmountLabel = { LOW: "적음", MEDIUM: "보통", HIGH: "많음" }[input.loadAmount];

  return [
    moveTypeLabel,
    `${input.fromRegion}에서 ${input.toRegion}으로 이동`,
    `이동거리 ${input.distanceKm}km`,
    `${input.houseSize}평`,
    `짐량 ${loadAmountLabel}`,
    `출발지 ${input.fromFloor}층 엘리베이터 ${input.fromElevator ? "있음" : "없음"}`,
    `도착지 ${input.toFloor}층 엘리베이터 ${input.toElevator ? "있음" : "없음"}`,
    `사다리차 ${input.ladderTruck ? "사용" : "미사용"}`,
    input.isWeekend ? "주말" : "평일",
    input.isPeakSeason ? "성수기" : "비성수기",
  ].join(", ");
}

export const pricePredictionService = {
  predictPrice: async (input: PricePredictionInput): Promise<PricePredictionResult> => {
    const prepared = prepareInput(input);
    const embedding = await createPricePredictionEmbedding(createSearchContent(prepared));

    const candidates = await pricePredictionRepository.findCandidates({
      embedding,
      moveType: prepared.moveType,
      loadAmount: prepared.loadAmount,
      houseSize: prepared.houseSize,
      distanceKm: prepared.distanceKm,
    });

    if (candidates.length === 0) {
      throw new AppError("BAD_REQUEST", {
        message: "입력 조건과 유사한 예상 견적 데이터가 충분하지 않습니다.",
      });
    }

    const ranked = rankPricePredictionCandidates(candidates, prepared);
    if (ranked.length === 0) {
      throw new AppError("BAD_REQUEST", {
        message: "입력 조건과 유사한 예상 견적 데이터가 충분하지 않습니다.",
      });
    }

    const price = calculatePricePrediction(ranked);

    return {
      estimatedPrice: price.estimated,
      priceRange: { min: price.min, max: price.max },
      sampleCount: ranked.length,
      factors: {
        moveType: prepared.moveType,
        route: `${prepared.fromRegion} → ${prepared.toRegion}`,
        distanceKm: prepared.distanceKm,
        houseSize: prepared.houseSize,
        loadAmount: prepared.loadAmount,
        isWeekend: prepared.isWeekend,
        isPeakSeason: prepared.isPeakSeason,
      },
    };
  },
  calculateRouteDistance: async (input: RouteDistanceInput): Promise<RouteDistanceResult> => {
    return getKakaoRouteDistance(input);
  },
};
