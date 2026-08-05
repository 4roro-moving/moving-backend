import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

const findByEmail = async (email: string, db: DbClient = prisma) => {
  return db.user.findUnique({
    where: {
      email,
    },
  });
};

const findById = async (id: string, db: DbClient = prisma) => {
  return db.user.findUnique({
    where: {
      id,
    },
  });
};

export const adminAuthRepository = {
  findByEmail,
  findById,
};
