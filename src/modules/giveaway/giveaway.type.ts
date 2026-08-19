import type { z } from "zod";

import type {
  cancelGiveawayRequestParamSchema,
  completeGiveawayParamSchema,
  createGiveawayRequestSchema,
  createGiveawaySchema,
  giveawayIdParamSchema,
  giveawayRequestIdParamSchema,
  listGiveawayQuerySchema,
  listGiveawayRequestQuerySchema,
  listMyGiveawayQuerySchema,
  rejectGiveawayRequestParamSchema,
  selectGiveawayRequestParamSchema,
  updateGiveawayRequestSchema,
  updateGiveawaySchema,
} from "./giveaway.validator";

export const GIVEAWAY_STATUS = {
  AVAILABLE: "AVAILABLE",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;

export const GIVEAWAY_REQUEST_STATUS = {
  PENDING: "PENDING",
  SELECTED: "SELECTED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export const ACTIVE_GIVEAWAY_REQUEST_STATUSES = [
  GIVEAWAY_REQUEST_STATUS.PENDING,
  GIVEAWAY_REQUEST_STATUS.SELECTED,
] as const;

export const GIVEAWAY_VISIBILITY = {
  HIDDEN: true,
  VISIBLE: false,
} as const;

export const GIVEAWAY_TEXT_LENGTH = {
  TITLE_MIN: 1,
  TITLE_MAX: 100,
  DESCRIPTION_MIN: 1,
  DESCRIPTION_MAX: 2000,
  MESSAGE_MAX: 1000,
} as const;

export const GIVEAWAY_PAGINATION = {
  MAX_PAGE: 10000,
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 50,
} as const;

export const GIVEAWAY_USER_ROLE = {
  CUSTOMER: "CUSTOMER",
} as const;

export type GiveawayStatusValue = (typeof GIVEAWAY_STATUS)[keyof typeof GIVEAWAY_STATUS];
export type GiveawayRequestStatusValue =
  (typeof GIVEAWAY_REQUEST_STATUS)[keyof typeof GIVEAWAY_REQUEST_STATUS];

export type CreateGiveawayInput = z.infer<typeof createGiveawaySchema>;
export type UpdateGiveawayInput = z.infer<typeof updateGiveawaySchema>;
export type ListGiveawayQuery = z.infer<typeof listGiveawayQuerySchema>;
export type ListMyGiveawayQuery = z.infer<typeof listMyGiveawayQuerySchema>;
export type GiveawayIdParam = z.infer<typeof giveawayIdParamSchema>;
export type CompleteGiveawayParam = z.infer<typeof completeGiveawayParamSchema>;

export type CreateGiveawayRequestInput = z.infer<typeof createGiveawayRequestSchema>;
export type UpdateGiveawayRequestInput = z.infer<typeof updateGiveawayRequestSchema>;
export type ListGiveawayRequestQuery = z.infer<typeof listGiveawayRequestQuerySchema>;
export type GiveawayRequestIdParam = z.infer<typeof giveawayRequestIdParamSchema>;
export type SelectGiveawayRequestParam = z.infer<typeof selectGiveawayRequestParamSchema>;
export type RejectGiveawayRequestParam = z.infer<typeof rejectGiveawayRequestParamSchema>;
export type CancelGiveawayRequestParam = z.infer<typeof cancelGiveawayRequestParamSchema>;
