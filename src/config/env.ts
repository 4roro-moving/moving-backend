import "dotenv/config";

import { z } from "zod";

import { refreshTokenRotationGraceMsSchema } from "./refresh-token-rotation-grace-ms.schema";

const browserOriginSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        const url = new URL(value);

        return (
          (url.protocol === "http:" || url.protocol === "https:") &&
          url.username === "" &&
          url.password === "" &&
          url.pathname === "/" &&
          url.search === "" &&
          url.hash === "" &&
          !value.endsWith("/")
        );
      } catch {
        return false;
      }
    },
    {
      message:
        "CLIENT_URL entries must be valid http/https origins without path, query, fragment, or trailing slash",
    },
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PORT: z.coerce.number().default(5000),

  DATABASE_URL: z.string().min(1, {
    error: "DATABASE_URL is required",
  }),

  CLIENT_URL: z
    .string()
    .min(1, {
      error: "CLIENT_URL is required",
    })
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(
      z.array(browserOriginSchema).min(1, {
        error: "CLIENT_URL must contain at least one valid origin",
      }),
    ),

  GEMINI_API_KEY: z.string().min(1, {
    error: "GEMINI_API_KEY is required",
  }),

  GOOGLE_TRANSLATE_API_KEY: z.string().min(1, {
    error: "GOOGLE_TRANSLATE_API_KEY is required",
  }),

  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"]).default("info"),

  GOOGLE_CLIENT_ID: z.string().min(1, {
    error: "GOOGLE_CLIENT_ID is required",
  }),

  GOOGLE_CLIENT_SECRET: z.string().min(1, {
    error: "GOOGLE_CLIENT_SECRET is required",
  }),

  GOOGLE_REDIRECT_URI: z.url({
    error: "GOOGLE_REDIRECT_URI must be a valid URL",
  }),

  KAKAO_CLIENT_ID: z.string().min(1, {
    error: "KAKAO_CLIENT_ID is required",
  }),

  KAKAO_CLIENT_SECRET: z.string().min(1, {
    error: "KAKAO_CLIENT_SECRET is required",
  }),

  KAKAO_REDIRECT_URI: z.url({
    error: "KAKAO_REDIRECT_URI must be a valid URL",
  }),

  NAVER_CLIENT_ID: z.string().min(1, {
    error: "NAVER_CLIENT_ID is required",
  }),

  NAVER_CLIENT_SECRET: z.string().min(1, {
    error: "NAVER_CLIENT_SECRET is required",
  }),

  NAVER_REDIRECT_URI: z.url({
    error: "NAVER_REDIRECT_URI must be a valid URL",
  }),

  OAUTH_STATE_SECRET: z.string().min(32, {
    error: "OAUTH_STATE_SECRET must be at least 32 characters",
  }),

  REFRESH_TOKEN_ROTATION_GRACE_MS: refreshTokenRotationGraceMsSchema,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables");

  parsed.error.issues.forEach((issue) => {
    console.error(`${issue.path.join(".")} : ${issue.message}`);
  });

  process.exit(1);
}

export const env = parsed.data;
