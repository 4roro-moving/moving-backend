import type { z } from "zod";

import type {
  hideContentBodySchema,
  listAdminReviewsQuerySchema,
  reviewIdParamSchema,
  unhideContentBodySchema,
} from "./contents.validator";

export type ListAdminReviewsQuery = z.infer<typeof listAdminReviewsQuerySchema>;
export type ReviewIdParam = z.infer<typeof reviewIdParamSchema>;
export type HideContentBody = z.infer<typeof hideContentBodySchema>;
export type UnhideContentBody = z.infer<typeof unhideContentBodySchema>;

export type ContentType = "REVIEW";

export interface LatestModeration {
  action: "HIDE" | "UNHIDE";
  reason: string | null;
  adminName: string;
  createdAt: Date;
}

export interface AdminReviewListItem {
  id: number;
  contentType: ContentType;
  isHidden: boolean;
  rating: number;
  content: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
  mover: {
    id: string;
    name: string;
  };
  estimateId: number;
  reportCount: number;
  latestModeration: LatestModeration | null;
  createdAt: Date;
  updatedAt: Date;
}
