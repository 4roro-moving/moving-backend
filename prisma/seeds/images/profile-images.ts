/*
 * 프로필 이미지 파이프라인
 * ============================================================================
 *
 *  왜 필요한가
 *  ───────────
 *  기존 시드는 imageUrl 에 완성 URL(https://picsum.photos/...)을 넣었다.
 *  utils/image-url.ts 의 getImageUrl 에는 http(s) 로 시작하면 그대로 반환하는
 *  바이패스 분기가 있어서 화면에는 그림이 떴지만, 실제로는
 *    · DB 에 저장되는 값의 형태가 실서비스(S3 키)와 다르고
 *    · CloudFront 경로를 한 번도 타지 않으며
 *    · 프로필 수정 API 의 validateImageKeyOwnership(profiles/{userId}/) 을 통과 못 한다.
 *
 *  그래서 여기서는 실제 업로드 플로우와 동일한 규약을 만든다.
 *    1) DiceBear 로 원본 100장 생성 (결정적 — 네트워크·API 키 불필요)
 *    2) S3 seed-src/001.webp ~ 100.webp 로 업로드
 *    3) 계정별로 CopyObject → profiles/{userId}/seed-NNN.webp
 *    4) DB 에는 S3 키만 저장
 *
 *  CopyObject 는 서버사이드 복사라 다운로드가 없고, 요청 비용도 무시할 수준이다.
 *  3.5만 회를 동시 50개로 돌리면 수 분 안에 끝난다.
 *
 *  필요 패키지 (devDependencies):
 *    @dicebear/core @dicebear/collection sharp
 * ============================================================================
 */

import {
  CopyObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { PROFILE_IMAGE_POOL_SIZE } from "../config.js";

const SOURCE_PREFIX = "seed-src";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

function sourceKey(poolIndex: number): string {
  return `${SOURCE_PREFIX}/${String(poolIndex).padStart(3, "0")}.webp`;
}

/**
 * 원본 100장을 생성해 S3 에 올린다.
 *
 * 이미 올라가 있으면 건너뛴다 — 시드를 여러 번 돌려도 이 단계는 한 번만 하면 된다.
 */
export async function ensureSourceImages(s3: S3Client, bucket: string): Promise<void> {
  console.log("🖼️  프로필 원본 이미지를 확인합니다");

  // 마지막 장이 있으면 전체가 올라간 것으로 본다
  try {
    await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: sourceKey(PROFILE_IMAGE_POOL_SIZE) }),
    );
    console.log(`  ✅ 원본 ${PROFILE_IMAGE_POOL_SIZE}장 이미 존재 — 생성 생략`);

    return;
  } catch {
    // 없으면 아래에서 생성
  }

  console.log(`  … 원본 ${PROFILE_IMAGE_POOL_SIZE}장 생성 중 (DiceBear)`);

  /*
   * 동적 import 로 두는 이유:
   * dev 프리셋에서는 이미지 단계를 건너뛰므로, 패키지가 없어도
   * 시드 자체는 돌아가야 한다.
   */
  const [{ createAvatar }, collection, sharpModule] = await Promise.all([
    import("@dicebear/core"),
    import("@dicebear/collection"),
    import("sharp"),
  ]);

  const sharp = sharpModule.default;

  const styles = [
    collection.lorelei,
    collection.notionists,
    collection.avataaars,
    collection.adventurer,
  ];

  for (let i = 1; i <= PROFILE_IMAGE_POOL_SIZE; i += 1) {
    const style = styles[i % styles.length]!;

    const svg = createAvatar(style, {
      seed: `moving-seed-${i}`,
      size: 300,
    }).toString();

    const webp = await sharp(Buffer.from(svg)).resize(300, 300).webp({ quality: 82 }).toBuffer();

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: sourceKey(i),
        Body: webp,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000",
      }),
    );
  }

  console.log(`  ✅ 원본 ${PROFILE_IMAGE_POOL_SIZE}장 업로드 완료`);
}

/**
 * 계정별 키로 서버사이드 복사한다.
 *
 * targets 는 users.ts 가 만든 imageKey 를 그대로 받는다.
 * (profiles/{userId}/seed-NNN.webp 형식이므로 마지막 숫자로 원본을 역산한다)
 */
export async function copyProfileImages(
  s3: S3Client,
  bucket: string,
  imageKeys: string[],
  concurrency = 50,
): Promise<void> {
  console.log(
    `🖼️  계정별 프로필 이미지를 복사합니다 (${imageKeys.length.toLocaleString("ko-KR")}건)`,
  );

  const startedAt = Date.now();
  let done = 0;
  let lastLoggedAt = startedAt;

  const queue = [...imageKeys];

  async function worker(): Promise<void> {
    for (;;) {
      const key = queue.pop();

      if (!key) {
        return;
      }

      const match = /seed-(\d{3})\.webp$/.exec(key);
      const poolIndex = match ? Number(match[1]) : 1;

      await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: key,
          CopySource: `${bucket}/${sourceKey(poolIndex)}`,
          ContentType: "image/webp",
          CacheControl: "public, max-age=31536000",
          MetadataDirective: "REPLACE",
        }),
      );

      done += 1;

      const now = Date.now();

      if (now - lastLoggedAt > 5_000) {
        console.log(
          `     … ${done.toLocaleString("ko-KR")} / ${imageKeys.length.toLocaleString("ko-KR")}`,
        );
        lastLoggedAt = now;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`  ✅ ${done.toLocaleString("ko-KR")}건 복사 완료 (${elapsed}s)`);
}

export function makeS3Client(): { s3: S3Client; bucket: string } {
  const region = requireEnv("AWS_REGION");
  const bucket = requireEnv("AWS_S3_BUCKET");

  return {
    s3: new S3Client({ region, requestChecksumCalculation: "WHEN_REQUIRED" }),
    bucket,
  };
}
