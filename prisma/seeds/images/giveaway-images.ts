/*
 * 나눔 이미지 파이프라인
 * ============================================================================
 *
 *  프로필과 같이 DB 에는 S3 키만 넣고, 객체는 CopyObject 로 채운다.
 *
 *    1) seed-src/giveaways/{slug}-01.webp ~ -03.webp 원본 확인
 *       없으면 slug 가 적힌 플레이스홀더를 생성한다.
 *    2) CopyObject → giveaways/{authorId}/{uuid}.webp
 *
 *  실사진은 같은 원본 키로 덮어쓰면 된다. 이미 객체가 있으면 생성 단계를 건너뛴다.
 * ============================================================================
 */

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";

import {
  GIVEAWAY_IMAGE_VARIANT_COUNT,
  GIVEAWAY_ITEM_SLUGS,
  giveawaySourceKey,
} from "../lib/text.js";
import { makeS3Client } from "./profile-images.js";

export interface GiveawayImageCopy {
  sourceKey: string;
  destKey: string;
}

const ITEM_COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#ca8a04",
  "#4f46e5",
  "#ea580c",
] as const;

function isS3ObjectNotFoundError(error: unknown): boolean {
  if (!(error instanceof S3ServiceException)) {
    return false;
  }

  return (
    error.name === "NotFound" ||
    error.name === "NoSuchKey" ||
    error.$metadata.httpStatusCode === 404
  );
}

export function unusedGiveawayImageKeys(keys: string[], keep: Set<string>): string[] {
  return keys.filter((key) => {
    if (keep.has(key)) {
      return false;
    }

    if (key.startsWith("http://") || key.startsWith("https://")) {
      return false;
    }

    return key.startsWith("giveaways/");
  });
}

export async function ensureGiveawaySourceImages(s3: S3Client, bucket: string): Promise<void> {
  console.log("🖼️  나눔 원본 이미지를 확인합니다");

  const [{ default: sharp }] = await Promise.all([import("sharp")]);
  const slugs = Object.values(GIVEAWAY_ITEM_SLUGS);
  let created = 0;

  for (const slug of slugs) {
    for (let variant = 1; variant <= GIVEAWAY_IMAGE_VARIANT_COUNT; variant += 1) {
      const key = giveawaySourceKey(slug, variant);

      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        continue;
      } catch (error) {
        if (!isS3ObjectNotFoundError(error)) {
          throw error;
        }
      }

      const color = ITEM_COLORS[slugs.indexOf(slug) % ITEM_COLORS.length]!;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <rect width="100%" height="100%" fill="${color}"/>
        <text x="50%" y="48%" text-anchor="middle" font-size="52" fill="#fff" font-family="sans-serif">${slug}</text>
        <text x="50%" y="60%" text-anchor="middle" font-size="32" fill="#fff" font-family="sans-serif">${String(variant).padStart(2, "0")}</text>
      </svg>`;

      const webp = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: webp,
          ContentType: "image/webp",
          CacheControl: "public, max-age=31536000",
        }),
      );
      created += 1;
    }
  }

  const total = slugs.length * GIVEAWAY_IMAGE_VARIANT_COUNT;

  if (created === 0) {
    console.log(`  ✅ 원본 ${total}장 이미 존재 — 생성 생략`);
    return;
  }

  console.log(`  ✅ 나눔 원본 플레이스홀더 ${created}장 업로드 완료`);
}

export async function copyGiveawayImages(
  s3: S3Client,
  bucket: string,
  copies: GiveawayImageCopy[],
  copiedKeys: string[],
  concurrency = 50,
): Promise<void> {
  if (copies.length === 0) {
    console.log("🖼️  복사할 나눔 이미지가 없습니다");
    return;
  }

  console.log(`🖼️  나눔 이미지를 복사합니다 (${copies.length.toLocaleString("ko-KR")}건)`);

  const startedAt = Date.now();
  const queue = [...copies];
  let done = 0;
  let lastLoggedAt = startedAt;

  async function worker(): Promise<void> {
    for (;;) {
      const job = queue.pop();

      if (!job) {
        return;
      }

      await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: job.destKey,
          CopySource: `${bucket}/${job.sourceKey}`,
          ContentType: "image/webp",
          CacheControl: "public, max-age=31536000",
          MetadataDirective: "REPLACE",
        }),
      );

      copiedKeys.push(job.destKey);
      done += 1;
      const now = Date.now();

      if (now - lastLoggedAt > 5_000) {
        console.log(
          `     … ${done.toLocaleString("ko-KR")} / ${copies.length.toLocaleString("ko-KR")}`,
        );
        lastLoggedAt = now;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`  ✅ ${done.toLocaleString("ko-KR")}건 복사 완료 (${elapsed}s)`);
}

export async function deleteGiveawayImageKeys(
  s3: S3Client,
  bucket: string,
  keys: string[],
  concurrency = 50,
): Promise<void> {
  const uniqueKeys = [...new Set(keys)];

  if (uniqueKeys.length === 0) {
    return;
  }

  console.log(`🧹 나눔 이미지 ${uniqueKeys.length.toLocaleString("ko-KR")}건을 정리합니다`);

  const queue = [...uniqueKeys];

  async function worker(): Promise<void> {
    for (;;) {
      const key = queue.pop();

      if (!key) {
        return;
      }

      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        if (!isS3ObjectNotFoundError(error)) {
          throw error;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

export { makeS3Client };
