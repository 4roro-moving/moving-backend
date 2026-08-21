import type { ReportReason, ReportStatus, ReportTargetType } from "@prisma/client";
import type { z } from "zod";

import type { ReportImageItem } from "./report-image.type";
import type { createReportSchema } from "./report.validator";

export type CreateReportInput = z.infer<typeof createReportSchema>;

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
