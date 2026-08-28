import type { Request, Response } from "express";

import { sendResponse } from "../../utils/response.util";
import { translationService } from "./translation.service";
import type { TranslateInput } from "./translation.validator";

const translate = async (req: Request, res: Response) => {
  const result = await translationService.translate(req.body as TranslateInput);

  return sendResponse(res, 200, result);
};

export const translationController = { translate };
