import type { ErrorRequestHandler, Request, Response } from "express";

import logger from "../config/logger";
import { ApiError } from "../utils/ApiError";

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

const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req: Request,
  res: Response<ErrorResponse>,
  _next,
) => {
  if (error instanceof ApiError) {
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

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "서버 내부 오류가 발생했습니다.",
    },
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
};

export default errorHandler;
