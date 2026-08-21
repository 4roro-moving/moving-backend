import type {
  GiveawayStatus,
  ReportReason,
  ReportStatus,
  ReportTargetType,
  UserRole,
} from "@prisma/client";
import type { z } from "zod";

import type {
  handleReportBodySchema,
  listAdminReportsQuerySchema,
  reportIdParamSchema,
} from "./reports.validator";

export type ListAdminReportsQuery = z.infer<typeof listAdminReportsQuerySchema>;

export type ReportIdParam = z.infer<typeof reportIdParamSchema>;

export type HandleReportBody = z.infer<typeof handleReportBodySchema>;

export interface AdminReportUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AdminReportHandler {
  id: string;
  name: string;
  email: string;
}

export interface AdminReportListItem {
  id: number;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;

  reporter: AdminReportUser;

  handler: AdminReportHandler | null;
  handlerNote: string | null;
  handledAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface AdminReportImageItem {
  id: number;
  imageUrl: string;
}

export interface AdminReviewReportTarget {
  type: "REVIEW";
  id: number;
  rating: number;
  content: string;
  isHidden: boolean;
  createdAt: Date;
  author: {
    id: string;
    name: string;
    email: string;
  };
  mover: {
    id: string;
    name: string;
    nickname: string | null;
  };
}

export interface AdminMoverReportTarget {
  type: "MOVER";
  id: string;
  name: string;
  email: string;
  nickname: string | null;
  isActive: boolean;
}

export interface AdminResidenceReviewReportTarget {
  type: "RESIDENCE_REVIEW";
  id: number;
  title: string;
  content: string;
  rating: number;
  isHidden: boolean;
  createdAt: Date;
  author: {
    id: string;
    name: string;
    email: string;
  };
  region: {
    id: number;
    name: string;
  };
}

export interface AdminGiveawayReportTarget {
  type: "GIVEAWAY";
  id: number;
  title: string;
  description: string;
  status: GiveawayStatus;
  isHidden: boolean;
  createdAt: Date;
  author: {
    id: string;
    name: string;
    email: string;
  };
  region: {
    id: number;
    name: string;
  } | null;
  images: {
    id: number;
    imageKey: string;
    sortOrder: number;
  }[];
}

export type AdminReportTarget =
  | AdminReviewReportTarget
  | AdminMoverReportTarget
  | AdminResidenceReviewReportTarget
  | AdminGiveawayReportTarget;

export interface AdminReportDetail extends AdminReportListItem {
  target: AdminReportTarget | null;
  images: AdminReportImageItem[];
}
