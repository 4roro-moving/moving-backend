import fs from "node:fs";
import path from "node:path";
import { createLogger, format, transports } from "winston";

const logDir = path.join(process.cwd(), "logs");

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = createLogger({
  level: process.env.LOG_LEVEL ?? "info",

  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    format.errors({ stack: true }),
    format.json(),
  ),

  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({
          format: "YYYY-MM-DD HH:mm:ss",
        }),
        format.printf(({ timestamp, level, message, stack }) => {
          const line = `${timestamp} [${level}] ${message}`;

          return typeof stack === "string" ? `${line}\n${stack}` : line;
        }),
      ),
    }),

    new transports.File({
      filename: path.join(logDir, "combined.log"),
    }),

    new transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),
  ],
});

export default logger;
