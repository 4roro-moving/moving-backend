/*
 * 나눔만 재시드한다.
 * ============================================================================
 *
 *  prisma:seed 는 전 테이블을 TRUNCATE 하므로 AWS full 데이터에 쓰면 안 된다.
 *  이 스크립트는 giveaways / giveaway_images / giveaway_requests 만 비우고
 *  이미 있는 고객·지역으로 나눔을 다시 넣는다.
 *
 *  실행
 *    SEED_PRESET=full npm run seed:giveaways   # AWS full (나눔 2만)
 *    npm run seed:giveaways                    # dev (나눔 60)
 * ============================================================================
 */

import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { MASTER_SEED, resolveConfig } from "./config.js";
import { generateGiveaways } from "./generators/community.js";
import {
  copyGiveawayImages,
  ensureGiveawaySourceImages,
  makeS3Client,
} from "./images/giveaway-images.js";
import { analyze, loadMany, syncSequences } from "./lib/loader.js";
import { deriveRng } from "./lib/rng.js";

const prisma = new PrismaClient({ log: ["warn", "error"] });

async function main(): Promise<void> {
  const startedAt = Date.now();
  const config = resolveConfig();
  const now = new Date();

  console.log("");
  console.log("════════════════════════════════════════════════════");
  console.log(`  나눔 재시드 — ${config.name.toUpperCase()} 프리셋`);
  console.log("════════════════════════════════════════════════════");

  const [customers, regions, existingGiveaways] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CUSTOMER" },
      select: { id: true, createdAt: true },
    }),
    prisma.region.findMany({
      select: { id: true, name: true },
    }),
    prisma.giveaway.count(),
  ]);

  if (customers.length === 0 || regions.length === 0) {
    throw new Error("고객 또는 지역이 없습니다. 전체 시드가 먼저 있어야 합니다.");
  }

  console.log(`  고객 ${customers.length.toLocaleString("ko-KR")} / 지역 ${regions.length}`);
  console.log(
    `  기존 나눔 ${existingGiveaways.toLocaleString("ko-KR")}건 → ${config.giveaways.toLocaleString("ko-KR")}건으로 교체`,
  );
  console.log("  TRUNCATE: giveaways, giveaway_images, giveaway_requests");
  console.log("  고객·견적·리뷰·채팅은 그대로 둡니다");
  console.log("════════════════════════════════════════════════════");

  const { s3, bucket } = makeS3Client();

  await ensureGiveawaySourceImages(s3, bucket);

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "giveaway_requests", "giveaway_images", "giveaways"
    RESTART IDENTITY CASCADE
  `);
  console.log("  ✅ 나눔 테이블 비움");

  const rng = deriveRng(MASTER_SEED, "giveaways");
  const generated = generateGiveaways(rng, config, regions, customers, now);

  await loadMany("giveaways", prisma.giveaway, generated.giveaways as never[]);
  await loadMany("giveaway_images", prisma.giveawayImage, generated.images as never[]);
  await loadMany("giveaway_requests", prisma.giveawayRequest, generated.requests as never[]);

  await syncSequences(prisma);
  await copyGiveawayImages(s3, bucket, generated.imageCopies);
  await analyze(prisma);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("");
  console.log(`✅ 나눔 재시드 완료 (${elapsed}s)`);
}

main()
  .catch((error: unknown) => {
    console.error("❌ 나눔 재시드 실패");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
