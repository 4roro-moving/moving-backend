import type {
  PreparedPredictionInput,
  RankedEstimate,
  SimilarEstimateCandidate,
} from "./price-prediction.type";

const CAPITAL_AREA = new Set(["서울", "경기", "인천"]);

function closeness(actual: number, target: number, tolerance: number) {
  return Math.max(0, 1 - Math.abs(actual - target) / tolerance);
}

function isAllowedRoute(row: SimilarEstimateCandidate, input: PreparedPredictionInput) {
  const exact = row.from_region === input.fromRegion && row.to_region === input.toRegion;
  const reverse = row.from_region === input.toRegion && row.to_region === input.fromRegion;
  const sameCapitalArea =
    CAPITAL_AREA.has(input.fromRegion) &&
    CAPITAL_AREA.has(input.toRegion) &&
    CAPITAL_AREA.has(row.from_region) &&
    CAPITAL_AREA.has(row.to_region);
  return exact || reverse || sameCapitalArea;
}

function getRouteScore(row: SimilarEstimateCandidate, input: PreparedPredictionInput) {
  if (row.from_region === input.fromRegion && row.to_region === input.toRegion) return 1;
  if (row.from_region === input.toRegion && row.to_region === input.fromRegion) return 0.8;
  if (
    CAPITAL_AREA.has(input.fromRegion) &&
    CAPITAL_AREA.has(input.toRegion) &&
    CAPITAL_AREA.has(row.from_region) &&
    CAPITAL_AREA.has(row.to_region)
  )
    return 0.5;
  return 0;
}

export function rankPricePredictionCandidates(
  candidates: SimilarEstimateCandidate[],
  input: PreparedPredictionInput,
): RankedEstimate[] {
  const routeCandidates = candidates.filter((candidate) => isAllowedRoute(candidate, input));
  const source = routeCandidates.length >= 10 ? routeCandidates : candidates;

  return source
    .map((candidate) => {
      const structuredScore =
        getRouteScore(candidate, input) * 0.5 +
        closeness(candidate.house_size, input.houseSize, 8) * 0.3 +
        closeness(candidate.distance_km, input.distanceKm, Math.max(40, input.distanceKm)) * 0.2;

      return {
        ...candidate,
        structuredScore,
        finalScore: Number(candidate.similarity) * 0.6 + structuredScore * 0.4,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 20);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    throw new Error("Cannot calculate percentile from empty values.");
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;

  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);

  const lowerValue = sorted[lowerIndex];
  const upperValue = sorted[upperIndex];

  if (lowerValue === undefined || upperValue === undefined) {
    throw new Error("Failed to calculate percentile.");
  }

  if (lowerIndex === upperIndex) {
    return lowerValue;
  }

  const weight = index - lowerIndex;

  return Math.round(lowerValue * (1 - weight) + upperValue * weight);
}

const roundTo10k = (value: number) => Math.round(value / 10_000) * 10_000;

export function calculatePricePrediction(ranked: RankedEstimate[]) {
  const prices = ranked.map((candidate) => candidate.price);
  return {
    min: roundTo10k(percentile(prices, 0.25)),
    estimated: roundTo10k(percentile(prices, 0.5)),
    max: roundTo10k(percentile(prices, 0.75)),
  };
}
