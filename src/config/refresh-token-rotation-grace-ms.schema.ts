import { z } from "zod";

export const REFRESH_TOKEN_ROTATION_GRACE_MS_DEFAULT = 5_000;
export const REFRESH_TOKEN_ROTATION_GRACE_MS_MIN = 0;
export const REFRESH_TOKEN_ROTATION_GRACE_MS_MAX = 10_000;

const INTEGER_PATTERN = /^\d+$/;

export const refreshTokenRotationGraceMsSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    const normalized = String(value).trim();

    return normalized === "" ? undefined : normalized;
  },
  z
    .union([
      z.undefined(),
      z
        .string()
        .regex(INTEGER_PATTERN, {
          message:
            "REFRESH_TOKEN_ROTATION_GRACE_MS must be a non-negative integer without decimals",
        })
        .transform((value) => Number(value))
        .pipe(
          z
            .number()
            .int({
              message: "REFRESH_TOKEN_ROTATION_GRACE_MS must be a non-negative integer",
            })
            .min(REFRESH_TOKEN_ROTATION_GRACE_MS_MIN, {
              message: "REFRESH_TOKEN_ROTATION_GRACE_MS must be greater than or equal to 0",
            })
            .max(REFRESH_TOKEN_ROTATION_GRACE_MS_MAX, {
              message: `REFRESH_TOKEN_ROTATION_GRACE_MS must not exceed ${REFRESH_TOKEN_ROTATION_GRACE_MS_MAX}`,
            }),
        ),
    ])
    .transform((value) => value ?? REFRESH_TOKEN_ROTATION_GRACE_MS_DEFAULT),
);
