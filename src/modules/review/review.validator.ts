import { z } from "zod";

export const listMyReviewQuerySchema = z.object({
  // 기본값 페이지 1
  page: z.coerce.number().int().positive().default(1),
  // 기본값 페이지당 10개, 최대 50개
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export const createReviewSchema = z.object({
  estimateId: z.number().int().positive(),
  // 별점을 1~5 사이의 정수로 제한
  rating: z.number().int().min(1).max(5),
  // 리뷰 내용은 10자 이상
  content: z.string().trim().min(10),
});

export type ListMyReviewQuery = z.infer<typeof listMyReviewQuerySchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
