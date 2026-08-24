import { Router } from "express";

import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";
import { pricePredictionController } from "./price-prediction.controller";
import { predictPriceSchema, routeDistanceSchema } from "./price-prediction.validator";

const pricePredictionRouter = Router();

pricePredictionRouter.post(
  "/distance",
  validate({ body: routeDistanceSchema }),
  asyncHandler(pricePredictionController.calculateRouteDistance),
);

pricePredictionRouter.post(
  "/",
  validate({ body: predictPriceSchema }),
  asyncHandler(pricePredictionController.predictPrice),
);

export { pricePredictionRouter };
