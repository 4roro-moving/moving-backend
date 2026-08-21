import type {
  AuthProvider,
  EstimateRequestStatus,
  MoveType,
  ReportReason,
  ReportStatus,
  ReportTargetType,
  SuspensionAction,
} from "@prisma/client";
import type { z } from "zod";

import type { MEMBER_STATUS, MemberStatus } from "../member-status.constants";
import type {
  HistorySummary,
  MemberDetailAccount,
  MemberListBase,
  MemberSuspensionHistoryItem,
} from "../member.type";
import type { customerIdParamSchema, listCustomerQuerySchema } from "./customers.validator";

export type ListCustomerQuery = z.infer<typeof listCustomerQuerySchema>;
export type CustomerIdParam = z.infer<typeof customerIdParamSchema>;

export type UpdateCustomerStatusResponse = {
  id: string;
  status: Exclude<MemberStatus, typeof MEMBER_STATUS.WITHDRAWN>;
  suspension: {
    id: number;
    action: SuspensionAction;
    reason: string;
    adminId: string;
    createdAt: Date;
  };
};

export type CustomerListItem = MemberListBase & {
  authProvider: AuthProvider;
};

export type CustomerDetailProfile = {
  imageUrl: string | null;
  serviceAreas: string[];
  serviceTypes: MoveType[];
};

export type CustomerEstimateHistoryItem = {
  id: number;
  moveType: MoveType;
  status: EstimateRequestStatus;
  moveDate: Date;
  expiresAt: Date;
  expiredAt: Date | null;
  canceledAt: Date | null;
  /** CANCELED 요청의 취소 주체. 취소 이력이 없는 과거 데이터는 null입니다. */
  canceledBy: "CUSTOMER" | "ADMIN" | null;
  completedAt: Date | null;
  createdAt: Date;
  estimateSummary: {
    totalCount: number;
    sentCount: number;
    confirmedCount: number;
    expiredCount: number;
    canceledCount: number;
  };
  confirmedEstimate: {
    id: number;
    mover: {
      id: string;
      name: string;
      nickname: string | null;
    };
    price: number;
    confirmedAt: Date | null;
    cancelable: boolean;
  } | null;
};

export type CustomerReviewHistoryItem = {
  id: number;
  moverId: string;
  moverNickname: string;
  rating: number;
  content: string;
  isHidden: boolean;
  createdAt: Date;
};

export type CustomerReportHistoryItem = {
  id: number;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: Date;
};

export type CustomerDetail = {
  account: MemberDetailAccount;
  profile: CustomerDetailProfile;
  estimateRequests: HistorySummary<CustomerEstimateHistoryItem>;
  reviewHistory: HistorySummary<CustomerReviewHistoryItem>;
  reportHistory: {
    filed: HistorySummary<CustomerReportHistoryItem>;
    received: HistorySummary<CustomerReportHistoryItem>;
  };
  suspensionHistory: HistorySummary<MemberSuspensionHistoryItem>;
};
