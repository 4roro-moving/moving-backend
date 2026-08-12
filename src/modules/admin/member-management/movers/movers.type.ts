import type {
  AuthProvider,
  EstimateStatus,
  MoveType,
  ReportReason,
  ReportStatus,
  SuspensionAction,
} from "@prisma/client";
import type { z } from "zod";

import type { MemberStatus } from "../member-status.constants";
import type { listMoverQuerySchema, moverIdParamSchema } from "./movers.validator";

export type ListMoverQuery = z.infer<typeof listMoverQuerySchema>;
export type MoverIdParam = z.infer<typeof moverIdParamSchema>;

export type MoverListItem = {
  id: string;
  email: string;
  name: string;
  nickname: string | null;
  career: number;
  status: MemberStatus;
  isProfileCompleted: boolean;
  averageRating: number;
  reviewCount: number;
  confirmedCount: number;
  serviceAreas: string[];
  serviceTypes: MoveType[];
  createdAt: Date;
};

export type HistorySummary<T> = {
  totalCount: number;
  items: T[];
};

export type MoverDetailAccount = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  authProvider: AuthProvider;
  status: MemberStatus;
  isProfileCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type MoverDetailProfile = {
  nickname: string | null;
  imageUrl: string | null;
  career: number;
  shortIntro: string | null;
  description: string | null;
  averageRating: number;
  reviewCount: number;
  confirmedCount: number;
  serviceAreas: string[];
  serviceTypes: MoveType[];
};

export type MoverInProgressEstimateItem = {
  id: number;
  estimateRequestId: number;
  status: EstimateStatus;
  price: number;
  moveDate: Date;
  cancelable: boolean;
  createdAt: Date;
};

export type MoverRecentEstimateItem = {
  id: number;
  status: EstimateStatus;
  price: number;
  confirmedAt: Date | null;
};

export type MoverReviewHistoryItem = {
  id: number;
  customerId: string;
  rating: number;
  content: string;
  isHidden: boolean;
  createdAt: Date;
};

export type MoverReceivedReportHistoryItem = {
  id: number;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: Date;
};

export type MoverSuspensionHistoryItem = {
  id: number;
  action: SuspensionAction;
  reason: string;
  createdAt: Date;
};

export type MoverDetail = {
  account: MoverDetailAccount;
  profile: MoverDetailProfile;
  estimateActivity: {
    inProgress: HistorySummary<MoverInProgressEstimateItem>;
    recent: HistorySummary<MoverRecentEstimateItem>;
  };
  reviewHistory: HistorySummary<MoverReviewHistoryItem>;
  reportHistory: {
    received: HistorySummary<MoverReceivedReportHistoryItem>;
  };
  suspensionHistory: HistorySummary<MoverSuspensionHistoryItem>;
};
