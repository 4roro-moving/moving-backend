import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PORT: z.coerce.number().default(5000),

  DATABASE_URL: z.string().min(1, {
    error: "DATABASE_URL is required",
  }),

  /**
   * 허용 Origin 목록.
   * 단일 URL 또는 콤마로 구분한 여러 URL을 받을 수 있다.
   * 예: http://localhost:3000
   * 예: http://localhost:3000,http://localhost:3001
   */
  CLIENT_URL: z
    .string()
    .min(1, { error: "CLIENT_URL is required" })
    .transform((value, ctx) => {
      const origins = value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);

      if (origins.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "CLIENT_URL must include at least one URL",
        });
        return z.NEVER;
      }

      for (const origin of origins) {
        const parsed = z.url().safeParse(origin);
        if (!parsed.success) {
          ctx.addIssue({
            code: "custom",
            message: `CLIENT_URL contains an invalid URL: ${origin}`,
          });
          return z.NEVER;
        }
      }

      return origins;
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
