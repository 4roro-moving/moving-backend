import type { RequestHandler } from "express";
import type { ZodObject, ZodType } from "zod";

import { AppError } from "../lib/app-error";

export type ValidationSchemas = {
  body?: ZodType;
  query?: ZodObject;
  params?: ZodObject;
};

export const VALIDATION_SCHEMAS = Symbol("validationSchemas");

export type SchemaCarrier = RequestHandler & {
  [VALIDATION_SCHEMAS]?: ValidationSchemas;
};

export function validate(schemas: ValidationSchemas): RequestHandler {
  const handler: SchemaCarrier = (req, res, next) => {
    const errors: { path: string; message: string }[] = [];

    const check = (key: keyof ValidationSchemas, value: unknown) => {
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

  handler[VALIDATION_SCHEMAS] = schemas;

  return handler;
}
