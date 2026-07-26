import { Prisma, type PrismaClient } from "@prisma/client";

import { AppError } from "../lib/app-error";
import { prisma } from "../lib/prisma";

export type DbClient = PrismaClient | Prisma.TransactionClient;

const MAX_TRANSACTION_RETRIES = 3;
const TRANSACTION_RETRY_DELAY_MS = 50;

type TransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
};

function isTransactionConflict(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const runTransaction = async <T>(
  callback: (db: Prisma.TransactionClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> => {
  for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => callback(tx), options);
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === MAX_TRANSACTION_RETRIES - 1) {
        throw error;
      }

      await wait(TRANSACTION_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw new AppError("INTERNAL_SERVER_ERROR", {
    message: "트랜잭션 재시도 횟수를 초과했습니다.",
  });
};
