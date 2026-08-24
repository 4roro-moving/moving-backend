import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const fileArg = process.argv.find((value) => value.startsWith("--file="));
const filePath = fileArg?.slice("--file=".length);
const BATCH_SIZE = 100;

if (fileArg && !filePath) {
  throw new Error("--file에는 CSV 파일 경로를 입력해야 합니다.");
}

const CSV_PATH = filePath ?? "moving-price-synthetic-5000.csv";

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

function createRowError(rowNumber: number, message: string): Error {
  return new Error(`CSV ${rowNumber}행: ${message}`);
}

function parseRequiredString(value: string, fieldName: string, rowNumber: number): string {
  const normalized = value.trim();

  if (!normalized) {
    throw createRowError(rowNumber, `${fieldName} 값이 비어 있습니다.`);
  }

  return normalized;
}

function parseEnum(
  value: string,
  fieldName: string,
  allowedValues: readonly string[],
  rowNumber: number,
): string {
  const normalized = parseRequiredString(value, fieldName, rowNumber);

  if (!allowedValues.includes(normalized)) {
    throw createRowError(
      rowNumber,
      `${fieldName} 값은 ${allowedValues.join(" | ")} 중 하나여야 합니다.`,
    );
  }

  return normalized;
}

function parseFiniteNumber(value: string, fieldName: string, rowNumber: number): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw createRowError(rowNumber, `${fieldName} 값이 유한한 숫자가 아닙니다.`);
  }

  return numberValue;
}

function parsePositiveInteger(value: string, fieldName: string, rowNumber: number): number {
  const numberValue = parseFiniteNumber(value, fieldName, rowNumber);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw createRowError(rowNumber, `${fieldName} 값은 1 이상의 정수여야 합니다.`);
  }

  return numberValue;
}

function parsePositiveNumber(value: string, fieldName: string, rowNumber: number): number {
  const numberValue = parseFiniteNumber(value, fieldName, rowNumber);

  if (numberValue <= 0) {
    throw createRowError(rowNumber, `${fieldName} 값은 0보다 커야 합니다.`);
  }

  return numberValue;
}

function parseBoolean(value: string, fieldName: string, rowNumber: number): boolean {
  const normalized = value.trim().toLowerCase();

  if (normalized === "true") return true;
  if (normalized === "false") return false;

  throw createRowError(rowNumber, `${fieldName} 값은 true 또는 false여야 합니다.`);
}

function parseDate(value: string, fieldName: string, rowNumber: number): string {
  const normalized = value.trim();
  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== normalized
  ) {
    throw createRowError(rowNumber, `${fieldName} 값이 YYYY-MM-DD 형식의 유효한 날짜가 아닙니다.`);
  }

  return normalized;
}

function parseRow(line: string, rowNumber: number): PriceRow {
  const values = parseCsvLine(line);

  if (values.length !== 16) {
    throw createRowError(
      rowNumber,
      `컬럼 수가 올바르지 않습니다. 예상 16개, 실제 ${values.length}개입니다.`,
    );
  }

  return {
    moveType: parseEnum(values[0]!, "move_type", ["SMALL", "HOME", "OFFICE"], rowNumber),
    moveDate: parseDate(values[1]!, "move_date", rowNumber),
    fromRegion: parseRequiredString(values[2]!, "from_region", rowNumber),
    toRegion: parseRequiredString(values[3]!, "to_region", rowNumber),
    distanceKm: parsePositiveNumber(values[4]!, "distance_km", rowNumber),
    houseSize: parsePositiveInteger(values[5]!, "house_size", rowNumber),
    loadAmount: parseEnum(values[6]!, "load_amount", ["LOW", "MEDIUM", "HIGH"], rowNumber),
    fromFloor: parsePositiveInteger(values[7]!, "from_floor", rowNumber),
    fromElevator: parseBoolean(values[8]!, "from_elevator", rowNumber),
    toFloor: parsePositiveInteger(values[9]!, "to_floor", rowNumber),
    toElevator: parseBoolean(values[10]!, "to_elevator", rowNumber),
    ladderTruck: parseBoolean(values[11]!, "ladder_truck", rowNumber),
    isWeekend: parseBoolean(values[12]!, "is_weekend", rowNumber),
    isPeakSeason: parseBoolean(values[13]!, "is_peak_season", rowNumber),
    price: parsePositiveNumber(values[14]!, "price", rowNumber),
    content: parseRequiredString(values[15]!, "content", rowNumber),
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

  const rows = lines.slice(1).map((line, index) => parseRow(line, index + 2));

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
