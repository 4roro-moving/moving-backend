export const MOVE_TYPES = ["SMALL", "HOME", "OFFICE"] as const;
export const LOAD_AMOUNTS = ["LOW", "MEDIUM", "HIGH"] as const;

export type MoveType = (typeof MOVE_TYPES)[number];
export type LoadAmount = (typeof LOAD_AMOUNTS)[number];

export type PricePredictionInput = {
  moveType: MoveType;
  fromRegion: string;
  toRegion: string;
  distanceKm: number;
  houseSize: number;
  loadAmount: LoadAmount;
  fromFloor: number;
  fromElevator: boolean;
  toFloor: number;
  toElevator: boolean;
  ladderTruck: boolean;
  moveDate: string;
};

export type PreparedPredictionInput = PricePredictionInput & {
  isWeekend: boolean;
  isPeakSeason: boolean;
};

export type SimilarEstimateCandidate = {
  id: bigint;
  move_type: MoveType;
  from_region: string;
  to_region: string;
  distance_km: number;
  house_size: number;
  load_amount: LoadAmount;
  price: number;
  similarity: number;
};

export type RankedEstimate = SimilarEstimateCandidate & {
  structuredScore: number;
  finalScore: number;
};

export type PricePredictionResult = {
  estimatedPrice: number;
  priceRange: { min: number; max: number };
  sampleCount: number;
  factors: {
    moveType: MoveType;
    route: string;
    distanceKm: number;
    houseSize: number;
    loadAmount: LoadAmount;
    isWeekend: boolean;
    isPeakSeason: boolean;
  };
};
