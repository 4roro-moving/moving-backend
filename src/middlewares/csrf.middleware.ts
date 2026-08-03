import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env";
import { AppError } from "../lib/app-error";

const allowedOrigins = [env.CLIENT_URL, env.CLIENT_DEV_URL].filter((origin): origin is string =>
  Boolean(origin),
);

export const csrfProtection = (req: Request, _res: Response, next: NextFunction): void => {
  const origin = req.get("origin");

  if (!origin) {
    if (env.NODE_ENV !== "production") {
      next();
      return;
    }

    throw new AppError("FORBIDDEN", {
      message: "요청 출처를 확인할 수 없습니다.",
    });
  }

  if (!allowedOrigins.includes(origin)) {
    throw new AppError("FORBIDDEN", {
      message: "허용되지 않은 요청 출처입니다.",
    });
  }

  next();
};
