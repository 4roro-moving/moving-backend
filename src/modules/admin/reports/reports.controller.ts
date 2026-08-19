import type { Request, Response } from "express";

import { AppError } from "../../../lib/app-error";

import { reportsService } from "./reports.service";
import type { HandleReportBody, ListAdminReportsQuery, ReportIdParam } from "./reports.type";

function getAdminId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const reportsController = {
  // GET /api/admin/reports
  getReportList: async (_req: Request, res: Response) => {
    const query = res.locals.query as ListAdminReportsQuery;

    const result = await reportsService.getReportList(query);

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  },

  // GET /api/admin/reports/:reportId
  getReportDetail: async (_req: Request, res: Response) => {
    const { reportId } = res.locals.params as ReportIdParam;

    const report = await reportsService.getReportDetail(reportId);

    res.status(200).json({
      success: true,
      data: report,
    });
  },

  // PATCH /api/admin/reports/:reportId
  handleReport: async (req: Request, res: Response) => {
    const { reportId } = res.locals.params as ReportIdParam;
    const input = req.body as HandleReportBody;

    const report = await reportsService.handleReport({
      adminId: getAdminId(req),
      reportId,
      input,
    });

    res.status(200).json({
      success: true,
      message: "신고가 처리되었습니다.",
      data: report,
    });
  },
};
