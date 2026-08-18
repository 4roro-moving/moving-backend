import type { Request, Response } from "express";

import { getAuthenticatedUserId } from "../../utils/request-auth.util";
import { sendResponse } from "../../utils/response.util";

import { reportService } from "./report.service";
import type { CreateReportInput } from "./report.type";

export const reportController = {
  // POST /api/reports
  createReport: async (req: Request, res: Response) => {
    const report = await reportService.createReport({
      reporterId: getAuthenticatedUserId(req),
      input: req.body as CreateReportInput,
    });

    return sendResponse(res, 201, report);
  },
};
