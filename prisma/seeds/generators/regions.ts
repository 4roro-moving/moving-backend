/*
 * 지역 마스터 (17개 시·도)
 *
 * 다른 모든 데이터가 이 id 를 참조하므로 가장 먼저 적재한다.
 * TRUNCATE 로 시퀀스를 초기화했으므로 id 는 1~17 로 결정적이다.
 */

import type { PrismaClient } from "@prisma/client";

export const REGIONS = [
  { name: "서울", latitude: 37.5665, longitude: 126.978 },
  { name: "부산", latitude: 35.1796, longitude: 129.0756 },
  { name: "대구", latitude: 35.8714, longitude: 128.6014 },
  { name: "인천", latitude: 37.4563, longitude: 126.7052 },
  { name: "광주", latitude: 35.1595, longitude: 126.8526 },
  { name: "대전", latitude: 36.3504, longitude: 127.3845 },
  { name: "울산", latitude: 35.5395, longitude: 129.3114 },
  { name: "세종", latitude: 36.48, longitude: 127.289 },
  { name: "경기", latitude: 37.2636, longitude: 127.0286 },
  { name: "강원", latitude: 37.8854, longitude: 127.7298 },
  { name: "충북", latitude: 36.6424, longitude: 127.489 },
  { name: "충남", latitude: 36.6012, longitude: 126.6608 },
  { name: "전북", latitude: 35.8202, longitude: 127.1089 },
  { name: "전남", latitude: 34.8161, longitude: 126.4629 },
  { name: "경북", latitude: 36.576, longitude: 128.5056 },
  { name: "경남", latitude: 35.2383, longitude: 128.6924 },
  { name: "제주", latitude: 33.4996, longitude: 126.5312 },
] as const;

export type RegionRow = { id: number; name: string };

export async function seedRegions(prisma: PrismaClient): Promise<RegionRow[]> {
  console.log("🗺️  지역 마스터를 생성합니다");

  await prisma.region.createMany({
    data: REGIONS.map((region, index) => ({
      id: index + 1,
      name: region.name,
      latitude: region.latitude,
      longitude: region.longitude,
    })),
  });

  const rows = REGIONS.map((region, index) => ({ id: index + 1, name: region.name }));

  console.log(`  ✅ 지역 ${rows.length}개`);

  return rows;
}
