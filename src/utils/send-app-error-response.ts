import type { Request, Response } from "express";

import type { AppError } from "../lib/app-error";
import type { ErrorResponse } from "../types/response.type";

/** AppError를 공통 오류 응답 형식으로 전송한다. */
export const sendAppErrorResponse = (
  req: Request,
  res: Response<ErrorResponse>,
  error: AppError,
): void => {
  res.status(error.status).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.data !== undefined && { data: error.data }),
    },
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
};
