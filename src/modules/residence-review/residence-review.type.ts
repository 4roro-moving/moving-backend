import type { z } from "zod";

import type {
  createResidenceReviewSchema,
  listMyResidenceReviewQuerySchema,
  listResidenceReviewQuerySchema,
  residenceReviewIdParamSchema,
  updateResidenceReviewSchema,
} from "./residence-review.validator";

export const RESIDENCE_REVIEW_VISIBILITY = {
  PUBLIC: false,
  HIDDEN: true,
} as const;

export const REGION_REVIEW_STATISTIC = {
  AVERAGE_DECIMAL_PLACES: 2,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
} as const;

export type CreateResidenceReviewInput = z.infer<typeof createResidenceReviewSchema>;
export type UpdateResidenceReviewInput = z.infer<typeof updateResidenceReviewSchema>;
export type ResidenceReviewIdParam = z.infer<typeof residenceReviewIdParamSchema>;
export type ListResidenceReviewQuery = z.infer<typeof listResidenceReviewQuerySchema>;
export type ListMyResidenceReviewQuery = z.infer<typeof listMyResidenceReviewQuerySchema>;

export type ResidenceReviewAuthor = {
  id: string;
  name: string;
};

export type ResidenceReviewRegion = {
  id: number;
  name: string;
};

export type PublicResidenceReview = {
  id: number;
  title: string;
  content: string;
  rating: number;
  region: ResidenceReviewRegion;
  author: ResidenceReviewAuthor;
  createdAt: Date;
  updatedAt: Date;
};

export type MyResidenceReview = PublicResidenceReview & {
  isHidden: boolean;
};
