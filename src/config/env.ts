import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PORT: z.coerce.number().default(5000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"]).default("info"),

  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),

  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),

  GOOGLE_REDIRECT_URI: z.string().url("GOOGLE_REDIRECT_URI must be a valid URL"),
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
