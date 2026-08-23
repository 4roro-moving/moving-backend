import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CSV_PATH = "moving-price-synthetic-5000.csv";
const BATCH_SIZE = 100;

type PriceRow = {
  moveType: string;
  moveDate: string;
  fromRegion: string;
  toRegion: string;
  distanceKm: number;
  houseSize: number;
  loadAmount: string;
  fromFloor: number;
  fromElevator: boolean;
  toFloor: number;
  toElevator: boolean;
  ladderTruck: boolean;
  isWeekend: boolean;
  isPeakSeason: boolean;
  price: number;
  content: string;
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function toBoolean(value: string): boolean {
  return value.trim().toLowerCase() === "true";
}

function parseRow(line: string): PriceRow {
  const values = parseCsvLine(line);

  if (values.length !== 16) {
    throw new Error(`CSV 컬럼 수가 올바르지 않습니다. 예상 16개, 실제 ${values.length}개`);
  }

  return {
    moveType: values[0],
    moveDate: values[1],
    fromRegion: values[2],
    toRegion: values[3],
    distanceKm: Number(values[4]),
    houseSize: Number(values[5]),
    loadAmount: values[6],
    fromFloor: Number(values[7]),
    fromElevator: toBoolean(values[8]),
    toFloor: Number(values[9]),
    toElevator: toBoolean(values[10]),
    ladderTruck: toBoolean(values[11]),
    isWeekend: toBoolean(values[12]),
    isPeakSeason: toBoolean(values[13]),
    price: Number(values[14]),
    content: values[15],
  };
}

async function insertBatch(rows: PriceRow[]) {
  const params: unknown[] = [];

  const valuesSql = rows
    .map((row, rowIndex) => {
      const offset = rowIndex * 16;

      params.push(
        row.moveType,
        row.moveDate,
        row.fromRegion,
        row.toRegion,
        row.distanceKm,
        row.houseSize,
        row.loadAmount,
        row.fromFloor,
        row.fromElevator,
        row.toFloor,
        row.toElevator,
        row.ladderTruck,
        row.isWeekend,
        row.isPeakSeason,
        row.price,
        row.content,
      );

      return `(
        $${offset + 1},
        $${offset + 2}::date,
        $${offset + 3},
        $${offset + 4},
        $${offset + 5},
        $${offset + 6},
        $${offset + 7},
        $${offset + 8},
        $${offset + 9},
        $${offset + 10},
        $${offset + 11},
        $${offset + 12},
        $${offset + 13},
        $${offset + 14},
        $${offset + 15},
        $${offset + 16}
      )`;
    })
    .join(",\n");

  const sql = `
    INSERT INTO price_prediction_vectors (
      move_type,
      move_date,
      from_region,
      to_region,
      distance_km,
      house_size,
      load_amount,
      from_floor,
      from_elevator,
      to_floor,
      to_elevator,
      ladder_truck,
      is_weekend,
      is_peak_season,
      price,
      content
    )
    VALUES ${valuesSql}
  `;

  await prisma.$executeRawUnsafe(sql, ...params);
}

async function main() {
  const raw = await readFile(CSV_PATH, "utf8");
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV에 데이터가 없습니다.");
  }

  const rows = lines.slice(1).map(parseRow);

  console.log(`CSV 로드 완료: ${rows.length.toLocaleString()}건`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await insertBatch(batch);

    const inserted = Math.min(i + BATCH_SIZE, rows.length);
    console.log(`DB 적재: ${inserted.toLocaleString()} / ${rows.length.toLocaleString()}`);
  }

  const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    "SELECT COUNT(*)::bigint AS count FROM price_prediction_vectors",
  );

  console.log(`완료: price_prediction_vectors 총 ${result[0]?.count.toString() ?? "0"}건`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
