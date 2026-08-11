import type { Request, Response } from "express";

import { AppError } from "../../../lib/app-error";
import { sendResponse } from "../../../utils/response.util";
import { adminEstimatesService } from "./estimates.service";
import type { AdminEstimateIdParam, CancelAdminEstimateBody } from "./estimates.type";

export const adminEstimatesController = {
  // PATCH /api/admin/estimates/:estimateId/cancel
  cancelConfirmedEstimate: async (req: Request, res: Response) => {
    const { estimateId } = res.locals.params as AdminEstimateIdParam;

    if (!req.admin) {
      throw new AppError("UNAUTHORIZED");
    }

    const result = await adminEstimatesService.cancelConfirmedEstimate({
      estimateId,
      adminId: req.admin.id,
      input: req.body as CancelAdminEstimateBody,
    });

    return sendResponse(res, 200, result);
  },
};
