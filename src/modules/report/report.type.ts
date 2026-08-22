import type { ReportReason, ReportStatus, ReportTargetType } from "@prisma/client";
import type { z } from "zod";

import type { ReportImageItem } from "./report-image.type";
import type { createReportSchema, listMyReportsQuerySchema } from "./report.validator";

export type CreateReportInput = z.infer<typeof createReportSchema>;

export type ListMyReportsQuery = z.infer<typeof listMyReportsQuerySchema>;

export interface ReportItem {
  id: number;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  status: ReportStatus;
  description: string | null;
  images: ReportImageItem[];
  createdAt: Date;
}

export interface MyReportItem {
  id: number;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  status: ReportStatus;
  description: string | null;
  images: ReportImageItem[];
  handledAt: Date | null;
  createdAt: Date;
}
