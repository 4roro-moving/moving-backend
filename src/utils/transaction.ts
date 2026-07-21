import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export const runTransaction = async <T>(
  callback: (db: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => {
  return prisma.$transaction(async (tx) => callback(tx));
};
