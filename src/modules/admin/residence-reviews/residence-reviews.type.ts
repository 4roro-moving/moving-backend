import type { z } from "zod";

import type {
  hideResidenceReviewBodySchema,
  listAdminResidenceReviewsQuerySchema,
  residenceReviewIdParamSchema,
  unhideResidenceReviewBodySchema,
} from "./residence-reviews.validator";

export type { AdminResidenceReviewSort } from "./residence-reviews.constants";
export { ADMIN_RESIDENCE_REVIEW_SORTS } from "./residence-reviews.constants";

export type ListAdminResidenceReviewsQuery = z.infer<typeof listAdminResidenceReviewsQuerySchema>;
export type ResidenceReviewIdParam = z.infer<typeof residenceReviewIdParamSchema>;
export type HideResidenceReviewBody = z.infer<typeof hideResidenceReviewBodySchema>;
/** 복구 API는 body 필드 없음 (빈 객체) */
export type UnhideResidenceReviewBody = z.infer<typeof unhideResidenceReviewBodySchema>;

export type ResidenceReviewContentType = "RESIDENCE_REVIEW";

export interface LatestModeration {
  action: "HIDE" | "UNHIDE";
  reason: string | null;
  adminName: string;
  createdAt: Date;
}

export interface AdminResidenceReviewListItem {
  id: number;
  contentType: ResidenceReviewContentType;
  isHidden: boolean;
  rating: number;
  title: string;
  content: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
  region: {
    id: number;
    name: string;
  };
  reportCount: number;
  latestModeration: LatestModeration | null;
  createdAt: Date;
  updatedAt: Date;
}
