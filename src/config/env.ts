import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PORT: z.coerce.number().default(5000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"]).default("info"),
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
