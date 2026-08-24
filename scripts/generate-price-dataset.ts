/**
 * MOVING 예상견적 합성 데이터 생성기
 *
 * 실제 거래 데이터가 아니라 공개 시세 기반 synthetic dataset입니다.
 * SMALL / HOME / OFFICE를 서로 다른 가격 곡선으로 생성합니다.
 *
 * 실행:
 *   npx tsx scripts/generate-price-dataset.ts --count=5000
 *   npx tsx scripts/generate-price-dataset.ts --count=10000
 */
import { writeFileSync } from "node:fs";

type MoveType = "SMALL" | "HOME" | "OFFICE";
type LoadAmount = "LOW" | "MEDIUM" | "HIGH";

const countArg = process.argv.find((v) => v.startsWith("--count="));
const countValue = countArg?.split("=")[1] ?? "5000";
const count = Number(countValue);

if (!Number.isSafeInteger(count) || count <= 0) {
  throw new Error("--count는 1 이상의 정수여야 합니다.");
}

const regions = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

const neighbors: Record<string, string[]> = {
  서울: ["경기", "인천"],
  인천: ["서울", "경기"],
  경기: ["서울", "인천", "강원", "충북", "충남"],
  강원: ["경기", "충북", "경북"],
  대전: ["세종", "충남", "충북"],
  세종: ["대전", "충남", "충북"],
  충북: ["경기", "강원", "대전", "세종", "충남", "경북"],
  충남: ["경기", "대전", "세종", "충북", "전북"],
  전북: ["충남", "전남", "광주", "경북", "경남"],
  광주: ["전남", "전북"],
  전남: ["광주", "전북", "경남"],
  대구: ["경북", "경남", "울산"],
  경북: ["대구", "강원", "충북", "전북", "경남", "울산"],
  경남: ["부산", "울산", "대구", "경북", "전북", "전남"],
  부산: ["경남", "울산"],
  울산: ["부산", "경남", "경북", "대구"],
  제주: ["제주"],
};

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}
function between(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function int(min: number, max: number) {
  return Math.floor(between(min, max + 1));
}
function round10k(v: number) {
  return Math.max(200_000, Math.round(v / 10_000) * 10_000);
}

function destination(from: string) {
  const r = Math.random();
  if (r < 0.45) return from;
  if (r < 0.85) return pick(neighbors[from] ?? [from]);
  return pick(regions.filter((v) => v !== from));
}

// CSV 생성기에서는 실제 좌표 대신 현실적인 거리 구간을 사용.
// 서비스 API에서는 지도/거리 API 값으로 대체하는 것을 권장.
function distanceKm(from: string, to: string) {
  if (from === to) return int(5, 38);
  if (from === "제주" || to === "제주") return int(300, 650);

  const metro = ["서울", "경기", "인천"].includes(from) && ["서울", "경기", "인천"].includes(to);
  if (metro) return int(20, 75);

  const adjacent = (neighbors[from] ?? []).includes(to);
  if (adjacent) return int(35, 180);

  return int(160, 450);
}

function basePrice(type: MoveType, size: number) {
  let range: [number, number];
  if (type === "SMALL") {
    range =
      size <= 8
        ? [300_000, 420_000]
        : size <= 12
          ? [380_000, 520_000]
          : size <= 16
            ? [480_000, 650_000]
            : [580_000, 780_000];
  } else if (type === "HOME") {
    range =
      size <= 15
        ? [750_000, 950_000]
        : size <= 20
          ? [850_000, 1_150_000]
          : size <= 24
            ? [1_100_000, 1_400_000]
            : size <= 32
              ? [1_300_000, 1_700_000]
              : size <= 39
                ? [1_650_000, 2_150_000]
                : [2_200_000, 2_800_000];
  } else {
    range =
      size <= 20
        ? [500_000, 800_000]
        : size <= 40
          ? [850_000, 1_400_000]
          : size <= 70
            ? [1_300_000, 2_200_000]
            : [2_000_000, 3_200_000];
  }
  return between(...range);
}

function distanceAddon(km: number, type: MoveType) {
  const range: [number, number] =
    km <= 20
      ? [0, 20_000]
      : km <= 50
        ? [40_000, 100_000]
        : km <= 100
          ? [100_000, 180_000]
          : km <= 200
            ? [180_000, 300_000]
            : km <= 350
              ? [300_000, 450_000]
              : [450_000, 650_000];
  return between(...range) * (type === "OFFICE" ? 1.12 : 1);
}

function ladderAddon(floor: number) {
  const range: [number, number] =
    floor <= 5
      ? [120_000, 150_000]
      : floor <= 10
        ? [150_000, 180_000]
        : floor <= 15
          ? [180_000, 210_000]
          : floor <= 20
            ? [220_000, 300_000]
            : [300_000, 500_000];
  return between(...range);
}

const header = [
  "move_type",
  "move_date",
  "from_region",
  "to_region",
  "distance_km",
  "house_size",
  "load_amount",
  "from_floor",
  "from_elevator",
  "to_floor",
  "to_elevator",
  "ladder_truck",
  "is_weekend",
  "is_peak_season",
  "price",
  "content",
];

const lines = [header.join(",")];

for (let i = 0; i < count; i++) {
  const r = Math.random();
  const moveType: MoveType = r < 0.55 ? "HOME" : r < 0.85 ? "SMALL" : "OFFICE";

  const fromRegion = pick(regions);
  const toRegion = destination(fromRegion);
  const distance = distanceKm(fromRegion, toRegion);

  const houseSize =
    moveType === "SMALL" ? int(5, 20) : moveType === "HOME" ? int(12, 48) : int(10, 100);

  const loadAmount: LoadAmount =
    moveType === "SMALL"
      ? Math.random() < 0.5
        ? "LOW"
        : Math.random() < 0.8
          ? "MEDIUM"
          : "HIGH"
      : moveType === "HOME"
        ? Math.random() < 0.2
          ? "LOW"
          : Math.random() < 0.75
            ? "MEDIUM"
            : "HIGH"
        : Math.random() < 0.15
          ? "LOW"
          : Math.random() < 0.6
            ? "MEDIUM"
            : "HIGH";

  const maxFloor = moveType === "HOME" ? 25 : 20;
  const fromFloor = int(1, maxFloor);
  const toFloor = int(1, maxFloor);

  const elevator = (floor: number) => Math.random() < (floor <= 2 ? 0.45 : floor <= 5 ? 0.68 : 0.9);

  const fromElevator = elevator(fromFloor);
  const toElevator = elevator(toFloor);

  const difficultAccess = (!fromElevator && fromFloor >= 3) || (!toElevator && toFloor >= 3);
  const ladderTruck = difficultAccess
    ? Math.random() < 0.58
    : Math.random() < (Math.max(fromFloor, toFloor) >= 12 ? 0.12 : 0.04);

  const moveDate = new Date(Date.now() + int(0, 364) * 86_400_000);
  const isWeekend = moveDate.getDay() === 0 || moveDate.getDay() === 6;
  const isPeakSeason = [2, 3, 8, 9, 12].includes(moveDate.getMonth() + 1);
  const moveDateLabel = [
    moveDate.getFullYear(),
    String(moveDate.getMonth() + 1).padStart(2, "0"),
    String(moveDate.getDate()).padStart(2, "0"),
  ].join("-");

  let price = basePrice(moveType, houseSize);
  price *=
    loadAmount === "LOW" ? 0.9 : loadAmount === "HIGH" ? (moveType === "OFFICE" ? 1.22 : 1.16) : 1;

  price += distanceAddon(distance, moveType);
  if (isWeekend) price *= between(1.1, 1.18);
  if (isPeakSeason) price *= between(1.08, 1.16);

  if (!fromElevator && fromFloor >= 3) price += between(40_000, 110_000);
  if (!toElevator && toFloor >= 3) price += between(40_000, 110_000);
  if (ladderTruck) price += ladderAddon(Math.max(fromFloor, toFloor));

  price *= between(0.95, 1.05);
  price = round10k(price);

  const typeLabel =
    moveType === "SMALL" ? "소형/원룸 이사" : moveType === "HOME" ? "가정 이사" : "사무실 이사";
  const loadLabel = loadAmount === "LOW" ? "적음" : loadAmount === "MEDIUM" ? "보통" : "많음";

  const content = [
    typeLabel,
    `${fromRegion}에서 ${toRegion}으로 이동`,
    `이동거리 ${distance}km`,
    `${houseSize}평`,
    `짐량 ${loadLabel}`,
    `출발지 ${fromFloor}층 엘리베이터 ${fromElevator ? "있음" : "없음"}`,
    `도착지 ${toFloor}층 엘리베이터 ${toElevator ? "있음" : "없음"}`,
    `사다리차 ${ladderTruck ? "사용" : "미사용"}`,
    isWeekend ? "주말" : "평일",
    isPeakSeason ? "성수기" : "비성수기",
  ].join(", ");

  const esc = (v: unknown) => `"${String(v).replaceAll('"', '""')}"`;

  lines.push(
    [
      moveType,
      moveDateLabel,
      fromRegion,
      toRegion,
      distance,
      houseSize,
      loadAmount,
      fromFloor,
      fromElevator,
      toFloor,
      toElevator,
      ladderTruck,
      isWeekend,
      isPeakSeason,
      price,
      esc(content),
    ].join(","),
  );
}

const filename = `moving-price-synthetic-${count}.csv`;
writeFileSync(filename, "\uFEFF" + lines.join("\n"), "utf8");
console.log(`${filename}: ${count.toLocaleString()}건 생성 완료`);
