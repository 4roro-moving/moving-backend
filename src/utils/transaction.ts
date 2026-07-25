import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";

export type DbClient = PrismaClient | Prisma.TransactionClient;

type TransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
};

export const runTransaction = async <T>(
  callback: (db: Prisma.TransactionClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> => {
  return prisma.$transaction(async (tx) => callback(tx), options);
};
