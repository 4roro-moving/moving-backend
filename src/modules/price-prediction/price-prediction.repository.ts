import { prisma } from "../../lib/prisma";
import type { LoadAmount, MoveType, SimilarEstimateCandidate } from "./price-prediction.type";

type FindCandidatesParams = {
  embedding: number[];
  moveType: MoveType;
  loadAmount: LoadAmount;
  houseSize: number;
  distanceKm: number;
};

export const pricePredictionRepository = {
  findCandidates({ embedding, moveType, loadAmount, houseSize, distanceKm }: FindCandidatesParams) {
    const vector = `[${embedding.join(",")}]`;

    return prisma.$queryRawUnsafe<SimilarEstimateCandidate[]>(
      `
        SELECT
          id, move_type, from_region, to_region, distance_km,
          house_size, load_amount, price,
          1 - (embedding <=> $1::vector) AS similarity
        FROM price_prediction_vectors
        WHERE embedding IS NOT NULL
          AND move_type = $2
          AND load_amount = $3
          AND house_size BETWEEN $4 AND $5
          AND distance_km BETWEEN $6 AND $7
        ORDER BY embedding <=> $1::vector
        LIMIT 150
      `,
      vector,
      moveType,
      loadAmount,
      Math.max(1, houseSize - 5),
      houseSize + 5,
      Math.max(0, distanceKm - 30),
      distanceKm + 30,
    );
  },
};
