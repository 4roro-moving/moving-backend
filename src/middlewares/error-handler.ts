import type { ErrorRequestHandler, Request, Response } from "express";

import logger from "../config/logger";
import { ERROR_CODES } from "../constants/error-code";
import { AppError } from "../lib/app-error";

type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    data?: unknown;
  };
  path: string;
  method: string;
  timestamp: string;
};

// 전역 에러 처리
const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req: Request,
  res: Response<ErrorResponse>,
  _next,
) => {
  if (error instanceof AppError) {
    res.status(error.status).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.data !== undefined && {
          data: error.data,
        }),
      },
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    });

    return;
  }

  logger.error("Unhandled error", {
    error,
    path: req.originalUrl,
    method: req.method,
  });

  const internalError = ERROR_CODES.INTERNAL_SERVER_ERROR;

  res.status(internalError.status).json({
    success: false,
    error: {
      code: internalError.code,
      message: internalError.message,
    },
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
};

export default errorHandler;
