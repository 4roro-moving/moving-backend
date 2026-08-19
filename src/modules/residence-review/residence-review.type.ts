import type { z } from "zod";

import type {
  createResidenceReviewSchema,
  listMyResidenceReviewQuerySchema,
  listResidenceReviewQuerySchema,
  regionIdParamSchema,
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

export type CreateResidenceReviewInput = z.infer<typeof createResidenceReviewSchema>;
export type UpdateResidenceReviewInput = z.infer<typeof updateResidenceReviewSchema>;
export type ResidenceReviewIdParam = z.infer<typeof residenceReviewIdParamSchema>;
export type RegionIdParam = z.infer<typeof regionIdParamSchema>;
export type ListResidenceReviewQuery = z.infer<typeof listResidenceReviewQuerySchema>;
export type ListMyResidenceReviewQuery = z.infer<typeof listMyResidenceReviewQuerySchema>;
export type ResidenceReviewListSort = ListResidenceReviewQuery["sort"];

export type ResidenceReviewCursorQuery = Pick<
  ListResidenceReviewQuery,
  "sort" | "keyword" | "regionId" | "rating"
>;

export type ResidenceReviewCursor = ResidenceReviewCursorQuery & {
  ratingCursor: number;
  createdAt: Date;
  id: number;
};

export type ResidenceReviewAuthor = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export type ResidenceReviewRegion = {
  id: number;
  name: string;
};

export type ResidenceReviewRegionSummary = ResidenceReviewRegion & {
  averageRating: number;
};

export type ResidenceReviewItem = {
  id: number;
  title: string;
  content: string;
  rating: number;
  region: ResidenceReviewRegionSummary;
  author: ResidenceReviewAuthor;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicResidenceReview = ResidenceReviewItem & {
  isMine: boolean;
};

export type MyResidenceReview = ResidenceReviewItem;

export type RegionReviewStatistic = {
  region: ResidenceReviewRegion;
  ratingSum: number;
  reviewCount: number;
  averageRating: number;
};
