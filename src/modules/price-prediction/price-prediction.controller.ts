import type { Request, Response } from "express";

import { sendResponse } from "../../utils/response.util";
import { pricePredictionService } from "./price-prediction.service";
import type { PricePredictionInput, RouteDistanceInput } from "./price-prediction.type";

export const pricePredictionController = {
  predictPrice: async (req: Request, res: Response) => {
    const input = req.body as PricePredictionInput;

    const result = await pricePredictionService.predictPrice(input);

    return sendResponse(res, 200, result);
  },

  calculateRouteDistance: async (req: Request, res: Response) => {
    const input = req.body as RouteDistanceInput;

    const result = await pricePredictionService.calculateRouteDistance(input);

    return sendResponse(res, 200, result);
  },
};
