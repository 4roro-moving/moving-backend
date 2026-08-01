import type { MoveType } from "@prisma/client";
import type { z } from "zod";

import type {
  moverEstimateRejectionListQuerySchema,
  moverEstimateRequestListQuerySchema,
  moverSentEstimateIdParamSchema,
  moverSentEstimateListQuerySchema,
  rejectEstimateBodySchema,
  sendEstimateBodySchema,
  sendEstimateParamSchema,
} from "./mover-estimate.validator";

export type MoverEstimateRequestListQuery = z.infer<typeof moverEstimateRequestListQuerySchema>;
export type MoverEstimateRejectionListQuery = z.infer<typeof moverEstimateRejectionListQuerySchema>;
export type MoverSentEstimateListQuery = z.infer<typeof moverSentEstimateListQuerySchema>;
export type MoverSentEstimateIdParam = z.infer<typeof moverSentEstimateIdParamSchema>;
export type SendEstimateParam = z.infer<typeof sendEstimateParamSchema>;
export type SendEstimateInput = z.infer<typeof sendEstimateBodySchema>;
export type RejectEstimateInput = z.infer<typeof rejectEstimateBodySchema>;

export type SendEstimateParams = {
  estimateRequestId: number;
  moverId: string;
  input: SendEstimateInput;
};

export type RejectEstimateParams = {
  estimateRequestId: number;
  moverId: string;
  input: RejectEstimateInput;
};

export type MoverEstimateRequestListItem = {
  id: number;
  customer: { id: string; name: string };
  moveType: MoveType;
  moveDate: string;
  fromAddress: string;
  toAddress: string;
  fromRegion: string;
  toRegion: string;
  isDesignated: boolean;
  createdAt: string;
};

export type MoverEstimateRequestListResult = {
  items: MoverEstimateRequestListItem[];
  pagination: {
    nextCursor: string | null;
    hasNextPage: boolean;
    totalCount: number;
  };
};

export type MoverEstimateRejectionListItem = {
  id: number;
  reason: string;
  rejectedAt: string;
  request: {
    id: number;
    customer: { id: string; name: string };
    moveType: MoveType;
    moveDate: string;
    fromAddress: string;
    toAddress: string;
    fromRegion: string;
    toRegion: string;
    isDesignated: boolean;
  };
};

export type MoverEstimateRejectionListResult = {
  items: MoverEstimateRejectionListItem[];
  pagination: { nextCursor: string | null; hasNextPage: boolean };
};
