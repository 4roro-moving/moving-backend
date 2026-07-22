import type { PrismaClient } from "@prisma/client";

import { REGION_NAMES } from "./regions.js";

export async function seedRegions(prisma: PrismaClient): Promise<Map<string, number>> {
  console.log("📍 지역 데이터를 생성합니다.");

  const regionIdMap = new Map<string, number>();

  for (const name of REGION_NAMES) {
    const region = await prisma.region.upsert({
      where: {
        name,
      },
      update: {},
      create: {
        name,
      },
    });

    regionIdMap.set(region.name, region.id);
  }

  console.log(`  ✅ 지역 ${REGION_NAMES.length}개 생성 완료`);

  return regionIdMap;
}
