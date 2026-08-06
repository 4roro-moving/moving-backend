import type { PrismaClient } from "@prisma/client";

import { REGIONS } from "./regions.js";

export async function seedRegions(prisma: PrismaClient): Promise<Map<string, number>> {
  console.log("📍 지역 데이터를 생성합니다.");

  const regionIdMap = new Map<string, number>();

  for (const { name, latitude, longitude } of REGIONS) {
    const region = await prisma.region.upsert({
      where: {
        name,
      },
      update: {
        latitude,
        longitude,
      },
      create: {
        name,
        latitude,
        longitude,
      },
    });

    regionIdMap.set(region.name, region.id);
  }

  console.log(`  ✅ 지역 ${REGIONS.length}개 생성 완료`);

  return regionIdMap;
}
