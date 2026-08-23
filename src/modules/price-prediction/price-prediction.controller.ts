import type { Request, Response } from "express";
import { pricePredictionService } from "./price-prediction.service";
import type { PricePredictionInput } from "./price-prediction.type";

export const pricePredictionController = {
  predictPrice: async (_req: Request, res: Response) => {
    const input = res.locals.body as PricePredictionInput;
    const result = await pricePredictionService.predictPrice(input);

    res.status(200).json({ success: true, data: result });
  },
};
