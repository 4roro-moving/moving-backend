import { Router } from "express";

import { authenticate, authorize } from "../../../middlewares/auth";
import { validate } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler.util";

import { reportsController } from "./reports.controller";
import {
  handleReportBodySchema,
  listAdminReportsQuerySchema,
  reportIdParamSchema,
} from "./reports.validator";

/**
 * 관리자 신고 관리
 * basePath: /api/admin/reports
 */
const adminReportRouter = Router();

adminReportRouter.use(authenticate, authorize("ADMIN"));

adminReportRouter.get(
  "/",
  validate({
    query: listAdminReportsQuerySchema,
  }),
  asyncHandler(reportsController.getReportList),
);

adminReportRouter.get(
  "/:reportId",
  validate({
    params: reportIdParamSchema,
  }),
  asyncHandler(reportsController.getReportDetail),
);

adminReportRouter.patch(
  "/:reportId",
  validate({
    params: reportIdParamSchema,
    body: handleReportBodySchema,
  }),
  asyncHandler(reportsController.handleReport),
);

export { adminReportRouter };
