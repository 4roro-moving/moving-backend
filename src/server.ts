import "dotenv/config";

import app from "./app";
import logger from "./config/logger";
import { prisma } from "./lib/prisma";

const port = Number(process.env.PORT) || 5000;

async function bootstrap() {
  try {
    await prisma.$connect();

    logger.info("Database connected successfully.");

    app.listen(port, () => {
      logger.info(`Server is running on http://localhost:${port}`);
    });
  } catch (error) {
    logger.error("Failed to start server.", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

void bootstrap();
