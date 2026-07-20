import app from "./app";
import { env } from "./config/env";
import logger from "./config/logger";
import { prisma } from "./lib/prisma";

async function bootstrap() {
  try {
    await prisma.$connect();

    logger.info("Database connected successfully.");

    app.listen(env.PORT, () => {
      logger.info(`Server is running on http://localhost:${env.PORT}`);
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(error);
    } else {
      logger.error("Failed to start server.", {
        error,
      });
    }

    await prisma.$disconnect();
    process.exit(1);
  }
}

void bootstrap();
