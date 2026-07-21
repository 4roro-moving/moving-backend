import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { ApiError } from "../utils/ApiError";

type Schemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

/**
 * zod 스키마로 요청을 검증합니다.
 *
 * Express 5 의 req.query 는 getter 전용이라 재할당할 수 없어서
 * 파싱 결과는 res.locals 에 담습니다. params 도 일관성을 위해 동일하게 처리합니다.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const errors: { path: string; message: string }[] = [];

    const check = (key: keyof Schemas, value: unknown) => {
      const schema = schemas[key];

      if (!schema) {
        return;
      }

      const result = schema.safeParse(value);

      if (!result.success) {
        result.error.issues.forEach((issue) => {
          errors.push({
            path: `${key}.${issue.path.join(".")}`,
            message: issue.message,
          });
        });

        return;
      }

      if (key === "body") {
        req.body = result.data;
      } else {
        res.locals[key] = result.data;
      }
    };

    check("body", req.body);
    check("params", req.params);
    check("query", req.query);

    if (errors.length > 0) {
      next(new ApiError("VALIDATION_ERROR", { data: errors }));
      return;
    }

    next();
  };
}
