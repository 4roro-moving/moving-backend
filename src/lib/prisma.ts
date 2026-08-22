import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [{ emit: "event", level: "query" }],
  });

// 재사용된 인스턴스에 리스너가 중복 등록되지 않도록 최초 1회만 붙인다
if (!globalForPrisma.prisma) {
  (
    prisma as unknown as {
      $on: (event: "query", cb: (e: Prisma.QueryEvent) => void) => void;
    }
  ).$on("query", (e) => {
    if (e.duration > 200) {
      console.log(`[SLOW ${e.duration}ms] ${e.query.slice(0, 120)}`);
    }
  });
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
