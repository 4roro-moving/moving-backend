/// <reference types="node" />

import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { syncPublicMoverReviewStats } from "../prisma/seeds/generators/stats.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await syncPublicMoverReviewStats(prisma);
  console.log("✅ 공개 리뷰 기준 기사 프로필 통계 동기화 완료");
}

main()
  .catch((error: unknown) => {
    console.error("❌ 공개 리뷰 기준 기사 프로필 통계 동기화 실패");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
