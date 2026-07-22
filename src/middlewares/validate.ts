import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { AppError } from "../lib/app-error";

type Schemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

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
      next(new AppError("VALIDATION_ERROR", { data: errors }));
      return;
    }

    next();
  };
}
