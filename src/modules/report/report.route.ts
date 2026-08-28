import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";

import { reportController } from "./report.controller";
import { createReportImageUploadUrlSchema } from "./report-image.validator";
import { createReportSchema, listMyReportsQuerySchema } from "./report.validator";

const reportRouter = Router();

reportRouter.use(authenticate, authorize("CUSTOMER", "MOVER"));

reportRouter.get(
  "/me",
  validate({ query: listMyReportsQuerySchema }),
  asyncHandler(reportController.getMyReports),
);

reportRouter.post(
  "/images/upload-url",
  validate({ body: createReportImageUploadUrlSchema }),
  asyncHandler(reportController.createImageUploadUrl),
);

reportRouter.post(
  "/",
  validate({ body: createReportSchema }),
  asyncHandler(reportController.createReport),
);

export default reportRouter;
