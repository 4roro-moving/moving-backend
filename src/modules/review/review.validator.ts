import { z } from "zod";

export const listMyReviewQuerySchema = z.object({
  // 기본값 페이지 1, 최대 1000페이지
  page: z.coerce
    .number("페이지는 숫자여야 합니다.")
    .int("페이지는 정수여야 합니다.")
    .positive("페이지는 1 이상이어야 합니다.")
    .max(1000, "페이지는 최대 1000까지 조회할 수 있습니다.")
    .default(1),
  // 기본값 페이지당 10개, 최대 50개
  limit: z.coerce
    .number("조회 개수는 숫자여야 합니다.")
    .int("조회 개수는 정수여야 합니다.")
    .positive("조회 개수는 1 이상이어야 합니다.")
    .max(50, "조회 개수는 최대 50개까지 가능합니다.")
    .default(10),
});

export const listMoverReviewQuerySchema = z.object({
  // 기본값 페이지 1, 최대 1000페이지
  page: z.coerce
    .number("페이지는 숫자여야 합니다.")
    .int("페이지는 정수여야 합니다.")
    .positive("페이지는 1 이상이어야 합니다.")
    .max(1000, "페이지는 최대 1000까지 조회할 수 있습니다.")
    .default(1),
  // 기사님 상세 리뷰 기본값 페이지당 5개, 최대 50개
  limit: z.coerce
    .number("조회 개수는 숫자여야 합니다.")
    .int("조회 개수는 정수여야 합니다.")
    .positive("조회 개수는 1 이상이어야 합니다.")
    .max(50, "조회 개수는 최대 50개까지 가능합니다.")
    .default(5),
});

export const createReviewSchema = z.object({
  estimateId: z.number().int().positive(),
  // 별점을 1~5 사이의 정수로 제한
  rating: z.number().int().min(1).max(5),
  // 리뷰 내용은 10자 이상
  content: z.string().trim().min(10),
});

export type ListMyReviewQuery = z.infer<typeof listMyReviewQuerySchema>;
export type ListMoverReviewQuery = z.infer<typeof listMoverReviewQuerySchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
