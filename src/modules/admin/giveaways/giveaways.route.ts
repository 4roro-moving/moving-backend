import { Router } from "express";

import { ADMIN_PERMISSIONS } from "../../../lib/auth/admin-permissions";

import { requireActiveAdmin } from "../../../middlewares/admin";
import { authorizeAdmin } from "../../../middlewares/admin-auth";
import { authenticate, authorize } from "../../../middlewares/auth";
import { validate } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler.util";

import { giveawaysController } from "./giveaways.controller";
import {
  giveawayIdParamSchema,
  hideGiveawayBodySchema,
  listAdminGiveawaysQuerySchema,
  unhideGiveawayBodySchema,
} from "./giveaways.validator";

/**
 * 관리자 콘텐츠 관리 — 나눔
 * basePath: /api/admin/giveaways
 */
const adminGiveawayRouter = Router();

adminGiveawayRouter.use(
  authenticate,
  authorize("ADMIN"),
  requireActiveAdmin,
  authorizeAdmin(ADMIN_PERMISSIONS.GIVEAWAY_MANAGE),
);

adminGiveawayRouter.get(
  "/",
  validate({ query: listAdminGiveawaysQuerySchema }),
  asyncHandler(giveawaysController.getGiveawayList),
);

adminGiveawayRouter.post(
  "/:giveawayId/hide",
  validate({ params: giveawayIdParamSchema, body: hideGiveawayBodySchema }),
  asyncHandler(giveawaysController.hideGiveaway),
);

adminGiveawayRouter.post(
  "/:giveawayId/unhide",
  validate({ params: giveawayIdParamSchema, body: unhideGiveawayBodySchema }),
  asyncHandler(giveawaysController.unhideGiveaway),
);

export { adminGiveawayRouter };
