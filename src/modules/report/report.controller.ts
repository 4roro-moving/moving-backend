import type { Request, Response } from "express";

import { AppError } from "../../lib/app-error";
import { sendResponse } from "../../utils/response.util";

import { reportImageService } from "./report-image.service";
import { reportService } from "./report.service";
import type { CreateReportInput } from "./report.type";

function getReporterId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

export const reportController = {
  // POST /api/reports/images/upload-url
  createImageUploadUrl: async (req: Request, res: Response) => {
    const data = await reportImageService.createUploadUrl(getReporterId(req), req.body);

    return sendResponse(res, 201, data);
  },

  // POST /api/reports
  createReport: async (req: Request, res: Response) => {
    const report = await reportService.createReport({
      reporterId: getReporterId(req),
      input: req.body as CreateReportInput,
    });

    return sendResponse(res, 201, report);
  },
};
