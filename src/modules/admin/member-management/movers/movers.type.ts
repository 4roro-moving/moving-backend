import type {
  EstimateRequestStatus,
  EstimateStatus,
  MoveType,
  ReportReason,
  ReportStatus,
  SuspensionAction,
} from "@prisma/client";
import type { z } from "zod";

import type {
  HistorySummary,
  MemberDetailAccount,
  MemberListBase,
  MemberSuspensionHistoryItem,
} from "../member.type";
import type {
  listMoverQuerySchema,
  moverIdParamSchema,
  updateMoverStatusBodySchema,
} from "./movers.validator";
import type { MemberStatus } from "../member-status.constants";

export type ListMoverQuery = z.infer<typeof listMoverQuerySchema>;
export type MoverIdParam = z.infer<typeof moverIdParamSchema>;
export type UpdateMoverStatusBody = z.infer<typeof updateMoverStatusBodySchema>;

export type UpdateMoverStatusResponse = {
  id: string;
  status: Exclude<MemberStatus, "WITHDRAWN">;
  suspension: {
    id: number;
    action: SuspensionAction;
    reason: string;
    adminId: string;
    createdAt: Date;
  };
};

export type MoverListItem = MemberListBase & {
  nickname: string | null;
  career: number;
  averageRating: number;
  reviewCount: number;
  confirmedCount: number;
  serviceAreas: string[];
  serviceTypes: MoveType[];
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

/** 완료 거래는 Estimate가 아닌 EstimateRequest 상태로 표시합니다. */
export type MoverEstimateActivityStatus =
  EstimateStatus | Extract<EstimateRequestStatus, "COMPLETED">;

export type MoverRecentEstimateItem = {
  id: number;
  status: MoverEstimateActivityStatus;
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

export type MoverDetail = {
  account: MemberDetailAccount;
  profile: MoverDetailProfile;
  estimateActivity: {
    inProgress: HistorySummary<MoverInProgressEstimateItem>;
    recent: HistorySummary<MoverRecentEstimateItem>;
  };
  reviewHistory: HistorySummary<MoverReviewHistoryItem>;
  reportHistory: {
    received: HistorySummary<MoverReceivedReportHistoryItem>;
  };
  suspensionHistory: HistorySummary<MemberSuspensionHistoryItem>;
};
