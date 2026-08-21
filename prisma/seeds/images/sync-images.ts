/*
 * DB에 저장된 프로필 이미지 키에 맞춰 S3 객체를 채운다.
 *
 * 시드와 분리한 이유: 이미지는 한 번 올려두면 재사용되므로
 * 시드를 돌릴 때마다 S3를 건드릴 필요가 없다.
 * dev/full 어느 쪽으로 시드했든 이 스크립트 하나로 맞출 수 있다.
 */
import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { copyProfileImages, ensureSourceImages, makeS3Client } from "./profile-images.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const { s3, bucket } = makeS3Client();

  await ensureSourceImages(s3, bucket);

  // DB에 실제로 들어 있는 키만 복사한다 — 시드 규모와 무관하게 동작한다
  const [customers, movers] = await Promise.all([
    prisma.customerProfile.findMany({
      where: { imageUrl: { not: null } },
      select: { imageUrl: true },
    }),
    prisma.moverProfile.findMany({
      where: { imageUrl: { not: null } },
      select: { imageUrl: true },
    }),
  ]);

  const keys = [...customers, ...movers]
    .map((row) => row.imageUrl)
    .filter((key): key is string => key !== null && !key.startsWith("http"));

  if (keys.length === 0) {
    console.log("복사할 이미지 키가 없습니다.");
    return;
  }

  await copyProfileImages(s3, bucket, keys);
}

main()
  .catch((error: unknown) => {
    console.error("❌ 이미지 동기화 실패");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
