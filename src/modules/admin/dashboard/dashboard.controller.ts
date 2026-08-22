import type { Request, Response } from "express";

import { dashboardService } from "./dashboard.service";
import type { DashboardQuery } from "./dashboard.type";

export const dashboardController = {
  // GET /api/admin/dashboard
  getDashboard: async (_req: Request, res: Response) => {
    const query = res.locals.query as DashboardQuery;

    const data = await dashboardService.getDashboard(query);

    res.status(200).json({
      success: true,
      data,
    });
  },
};
