import type { RequestHandler } from "express";

import { AppError } from "../lib/app-error";

// 존재하지 않는 경로 처리
const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new AppError("NOT_FOUND", {
      message: `${req.method} ${req.originalUrl} 경로를 찾을 수 없습니다.`,
    }),
  );
};

export default notFoundHandler;
