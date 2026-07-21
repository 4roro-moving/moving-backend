import { z } from "zod";

export const createReviewSchema = z.object({
  estimateId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  content: z.string().trim().min(1).max(1000),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
