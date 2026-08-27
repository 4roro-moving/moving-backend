import type { Request, Response } from "express";

import { AppError } from "../../lib/app-error";
import { sendResponse } from "../../utils/response.util";

import { reportImageService } from "./report-image.service";
import { reportService } from "./report.service";
import type { CreateReportInput, ListMyReportsQuery } from "./report.type";

function getReporterId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const reportController = {
  // GET /api/reports/me
  getMyReports: async (req: Request, res: Response) => {
    const result = await reportService.getMyReports({
      reporterId: getReporterId(req),
      query: res.locals.query as ListMyReportsQuery,
    });

    return sendResponse(res, 200, result.reports, {
      pagination: result.pagination,
    });
  },

  // POST /api/reports/images/upload-url
  createImageUploadUrl: async (req: Request, res: Response) => {
    const data = await reportImageService.createUploadUrl(getReporterId(req), req.body);

    return sendResponse(res, 201, data);
  },

  // POST /api/reports
  createReport: async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError("UNAUTHORIZED");
    }

    const report = await reportService.createReport({
      reporterId: req.user.id,
      reporterRole: req.user.role,
      input: req.body as CreateReportInput,
    });

    return sendResponse(res, 201, report);
  },
};
