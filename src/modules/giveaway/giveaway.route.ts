import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";
import { giveawayController } from "./giveaway.controller";
import { createGiveawayImageUploadUrlSchema } from "./giveaway-image.validator";
import { GIVEAWAY_USER_ROLE } from "./giveaway.type";
import {
  cancelGiveawayRequestParamSchema,
  completeGiveawayParamSchema,
  createGiveawayRequestSchema,
  createGiveawaySchema,
  giveawayIdParamSchema,
  giveawayRequestIdParamSchema,
  listGiveawayQuerySchema,
  listGiveawayRequestQuerySchema,
  listMyGiveawayQuerySchema,
  listMyGiveawayRequestQuerySchema,
  rejectGiveawayRequestParamSchema,
  selectGiveawayRequestParamSchema,
  updateGiveawayRequestSchema,
  updateGiveawaySchema,
} from "./giveaway.validator";

const giveawayRouter = Router();

giveawayRouter.use(authenticate, authorize(GIVEAWAY_USER_ROLE.CUSTOMER));

giveawayRouter.post(
  "/image/upload-url",
  validate({ body: createGiveawayImageUploadUrlSchema }),
  asyncHandler(giveawayController.createImageUploadUrl),
);

giveawayRouter.get(
  "/me",
  validate({ query: listMyGiveawayQuerySchema }),
  asyncHandler(giveawayController.getMyGiveawayList),
);

giveawayRouter.get(
  "/me/received",
  validate({ query: listMyGiveawayQuerySchema }),
  asyncHandler(giveawayController.getReceivedGiveawayList),
);

giveawayRouter
  .route("/")
  .get(
    validate({ query: listGiveawayQuerySchema }),
    asyncHandler(giveawayController.getGiveawayList),
  )
  .post(validate({ body: createGiveawaySchema }), asyncHandler(giveawayController.createGiveaway));

giveawayRouter.get(
  "/:giveawayId/requests",
  validate({ params: giveawayIdParamSchema, query: listGiveawayRequestQuerySchema }),
  asyncHandler(giveawayController.getGiveawayRequestList),
);

giveawayRouter.post(
  "/:giveawayId/requests",
  validate({ params: giveawayIdParamSchema, body: createGiveawayRequestSchema }),
  asyncHandler(giveawayController.createGiveawayRequest),
);

giveawayRouter.post(
  "/:giveawayId/requests/:requestId/select",
  validate({ params: selectGiveawayRequestParamSchema }),
  asyncHandler(giveawayController.selectGiveawayRequest),
);

giveawayRouter.post(
  "/:giveawayId/requests/:requestId/reject",
  validate({ params: rejectGiveawayRequestParamSchema }),
  asyncHandler(giveawayController.rejectGiveawayRequest),
);

giveawayRouter.post(
  "/:giveawayId/complete",
  validate({ params: completeGiveawayParamSchema }),
  asyncHandler(giveawayController.completeGiveaway),
);

giveawayRouter
  .route("/:giveawayId")
  .get(
    validate({ params: giveawayIdParamSchema }),
    asyncHandler(giveawayController.getGiveawayById),
  )
  .patch(
    validate({ params: giveawayIdParamSchema, body: updateGiveawaySchema }),
    asyncHandler(giveawayController.updateGiveaway),
  )
  .delete(
    validate({ params: giveawayIdParamSchema }),
    asyncHandler(giveawayController.deleteGiveaway),
  );

const giveawayRequestRouter = Router();

giveawayRequestRouter.use(authenticate, authorize(GIVEAWAY_USER_ROLE.CUSTOMER));

giveawayRequestRouter.get(
  "/me",
  validate({ query: listMyGiveawayRequestQuerySchema }),
  asyncHandler(giveawayController.getMyGiveawayRequestList),
);

giveawayRequestRouter.patch(
  "/:requestId",
  validate({ params: giveawayRequestIdParamSchema, body: updateGiveawayRequestSchema }),
  asyncHandler(giveawayController.updateGiveawayRequest),
);

giveawayRequestRouter.post(
  "/:requestId/cancel",
  validate({ params: cancelGiveawayRequestParamSchema }),
  asyncHandler(giveawayController.cancelGiveawayRequest),
);

export { giveawayRequestRouter, giveawayRouter };
