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

import type {
  customerIdParamSchema,
  customerStatusSchema,
  listCustomerQuerySchema,
  updateCustomerStatusBodySchema,
} from "./customers.validator";

export type CustomerStatus = z.infer<typeof customerStatusSchema>;
export type ListCustomerQuery = z.infer<typeof listCustomerQuerySchema>;
export type CustomerIdParam = z.infer<typeof customerIdParamSchema>;
export type UpdateCustomerStatusBody = z.infer<typeof updateCustomerStatusBodySchema>;

export type UpdateCustomerStatusResponse = {
  id: string;
  status: "ACTIVE" | "SUSPENDED";
  suspension: {
    id: number;
    action: "SUSPEND" | "RELEASE";
    reason: string;
    adminId: string;
    createdAt: Date;
  };
};

export type CustomerListItem = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: CustomerStatus;
  isProfileCompleted: boolean;
  createdAt: Date;
};

export type HistorySummary<T> = {
  totalCount: number;
  items: T[];
};

export type CustomerDetailAccount = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  authProvider: AuthProvider;
  status: CustomerStatus;
  isProfileCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
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

export type CustomerSuspensionHistoryItem = {
  id: number;
  action: SuspensionAction;
  reason: string;
  createdAt: Date;
};

export type CustomerDetail = {
  account: CustomerDetailAccount;
  profile: CustomerDetailProfile;
  estimateHistory: HistorySummary<CustomerEstimateHistoryItem>;
  reviewHistory: HistorySummary<CustomerReviewHistoryItem>;
  reportHistory: {
    filed: HistorySummary<CustomerReportHistoryItem>;
    received: HistorySummary<CustomerReportHistoryItem>;
  };
  suspensionHistory: HistorySummary<CustomerSuspensionHistoryItem>;
};
