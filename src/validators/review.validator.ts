import { z } from "zod";

export const createReviewSchema = z.object({
  estimateId: z.number().int().positive(),
  // 별점을 1~5 사이의 정수로 제한
  rating: z.number().int().min(1).max(5),
  // 리뷰 내용은 10자 이상
  content: z.string().trim().min(10),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
