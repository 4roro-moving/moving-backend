import type { RequestHandler } from "express";

import { ApiError } from "../utils/ApiError";

const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new ApiError("NOT_FOUND", {
      message: `${req.method} ${req.originalUrl} 경로를 찾을 수 없습니다.`,
    }),
  );
};

export default notFoundHandler;
