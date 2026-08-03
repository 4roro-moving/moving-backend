import type { PrismaClient } from "@prisma/client";

import { TERMS_SEEDS } from "./terms.js";

/** 오늘 기준 offsetDays 만큼 이동한 날짜를 반환합니다. null 이면 null. */
function resolveDate(offsetDays: number | null): Date | null {
  if (offsetDays === null) {
    return null;
  }

  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  return date;
}

/**
 * 약관 테스트 데이터를 생성합니다.
 *
 * 유형별로 현재 유효(PUBLISHED) 버전을 두고, 일부는 ARCHIVED/DRAFT 도 포함해
 * 버전 관리와 게시 상태를 확인할 수 있도록 합니다.
 * 여러 번 실행해도 중복이 쌓이지 않도록 기존 데이터를 먼저 정리합니다.
 */
export async function seedTerms(prisma: PrismaClient, adminIds: string[]): Promise<void> {
  const adminId = adminIds[0];

  if (adminId === undefined) {
    console.log("관리자 계정이 없어 약관 시드를 건너뜁니다.");

    return;
  }

  // 재실행 시 중복 방지를 위해 기존 약관을 정리합니다.
  await prisma.terms.deleteMany();

  for (const terms of TERMS_SEEDS) {
    await prisma.terms.create({
      data: {
        type: terms.type,
        version: terms.version,
        status: terms.status,
        title: terms.title,
        content: terms.content,
        isRequired: terms.isRequired,
        effectiveAt: resolveDate(terms.effectiveOffsetDays),
        publishedAt: resolveDate(terms.publishedOffsetDays),
        authorId: adminId,
      },
    });
  }

  console.log(`약관 시드 완료: ${String(TERMS_SEEDS.length)}건`);
}
