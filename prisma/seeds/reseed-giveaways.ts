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
 *
 *  순서: 메모리 생성 → S3 복사 → TRUNCATE+적재를 한 트랜잭션으로 처리.
 *  S3 가 실패하면 기존 나눔 DB 를 유지한다.
 *
 *  재실행
 *    실패 후 같은 명령을 다시 실행하면 된다.
 *    SEED_PRESET=full npm run seed:giveaways
 *
 *    고객 목록이 같으면 이미지 키가 같아져 CopyObject 가 같은 키를 덮어쓴다.
 *    그다음 DB 를 다시 교체하므로 S3·DB 가 맞춰진다.
 *
 *    실패 시 이번 실행에서 새로 만든 dest 키만 지운다 (기존 DB 가 쓰는 키는 유지).
 *    성공 시 예전 giveaway_images.imageKey 중 새 키에 없는 것만 지운다.
 *    giveaways/ prefix 전체 삭제는 하지 않는다.
 * ============================================================================
 */

import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";

import { MASTER_SEED, resolveConfig } from "./config.js";
import { generateGiveaways } from "./generators/community.js";
import {
  copyGiveawayImages,
  deleteGiveawayImageKeys,
  ensureGiveawaySourceImages,
  makeS3Client,
  unusedGiveawayImageKeys,
} from "./images/giveaway-images.js";
import { analyze, loadMany, syncSequences } from "./lib/loader.js";
import { deriveRng } from "./lib/rng.js";

const GIVEAWAY_RESEED_TX_TIMEOUT_MS = 300_000;
const GIVEAWAY_RESEED_TX_MAX_WAIT_MS = 20_000;

const prisma = new PrismaClient({ log: ["warn", "error"] });

async function main(): Promise<void> {
  const startedAt = Date.now();
  const config = resolveConfig();
  const now = new Date();

  console.log("");
  console.log("════════════════════════════════════════════════════");
  console.log(`  나눔 재시드 — ${config.name.toUpperCase()} 프리셋`);
  console.log("════════════════════════════════════════════════════");

  const [customers, regions, existingGiveaways, oldImageRows] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CUSTOMER" },
      select: { id: true, createdAt: true },
      orderBy: { id: "asc" },
    }),
    prisma.region.findMany({
      select: { id: true, name: true },
    }),
    prisma.giveaway.count(),
    prisma.giveawayImage.findMany({
      select: { imageKey: true },
    }),
  ]);

  if (customers.length === 0 || regions.length === 0) {
    throw new Error("고객 또는 지역이 없습니다. 전체 시드가 먼저 있어야 합니다.");
  }

  console.log(`  고객 ${customers.length.toLocaleString("ko-KR")} / 지역 ${regions.length}`);
  console.log(
    `  기존 나눔 ${existingGiveaways.toLocaleString("ko-KR")}건 → ${config.giveaways.toLocaleString("ko-KR")}건으로 교체`,
  );
  console.log("  고객·견적·리뷰·채팅은 그대로 둡니다");
  console.log("════════════════════════════════════════════════════");

  const rng = deriveRng(MASTER_SEED, "giveaways");
  const generated = generateGiveaways(rng, config, regions, customers, now);
  const oldKeys = oldImageRows.map((row) => row.imageKey);
  const oldKeySet = new Set(oldKeys);
  const newKeys = generated.imageCopies.map((copy) => copy.destKey);
  const newKeySet = new Set(newKeys);

  const { s3, bucket } = makeS3Client();
  const copiedKeys: string[] = [];

  async function replaceGiveawayRows(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRawUnsafe(`
      TRUNCATE TABLE "giveaway_requests", "giveaway_images", "giveaways"
      RESTART IDENTITY CASCADE
    `);
    console.log("  ✅ 나눔 테이블 비움");

    await loadMany("giveaways", tx.giveaway, generated.giveaways as never[]);
    await loadMany("giveaway_images", tx.giveawayImage, generated.images as never[]);
    await loadMany("giveaway_requests", tx.giveawayRequest, generated.requests as never[]);
    await syncSequences(tx);
  }

  try {
    await ensureGiveawaySourceImages(s3, bucket);
    await copyGiveawayImages(s3, bucket, generated.imageCopies, copiedKeys);
    await prisma.$transaction(replaceGiveawayRows, {
      timeout: GIVEAWAY_RESEED_TX_TIMEOUT_MS,
      maxWait: GIVEAWAY_RESEED_TX_MAX_WAIT_MS,
    });
  } catch (error) {
    const leftoverKeys = unusedGiveawayImageKeys(copiedKeys, oldKeySet);
    console.warn(
      `  ⚠️  실패 — 이번 실행에서 만든 S3 객체 ${leftoverKeys.length.toLocaleString("ko-KR")}건을 되돌립니다`,
    );

    try {
      await deleteGiveawayImageKeys(s3, bucket, leftoverKeys);
    } catch (cleanupError) {
      console.error("  ⚠️  실패 후 S3 정리에 실패했습니다");
      console.error(cleanupError);
    }

    throw error;
  }

  await deleteGiveawayImageKeys(s3, bucket, unusedGiveawayImageKeys(oldKeys, newKeySet));
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
