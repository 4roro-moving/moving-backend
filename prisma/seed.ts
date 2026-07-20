import "dotenv/config";

import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

import { SALT_ROUNDS, TEST_PASSWORD } from "./seeds/constants.js";
import { seedCustomers } from "./seeds/seedCustomers.js";
import { seedMovers } from "./seeds/seedMovers.js";
import { seedRegions } from "./seeds/seedRegions.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("");
  console.log("🌱 무빙 프로젝트 시드 데이터 생성을 시작합니다.");
  console.log("");

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);

  const regionIdMap = await seedRegions(prisma);

  console.log("");

  await seedCustomers(prisma, passwordHash);

  console.log("");

  await seedMovers(prisma, passwordHash, regionIdMap);

  console.log("");
  console.log("🎉 시드 데이터 생성이 완료되었습니다.");
  console.log("");
  console.log("────────────────────────────────────");
  console.log(`공통 비밀번호: ${TEST_PASSWORD}`);
  console.log("고객 계정: customer1@test.com ~ customer8@test.com");
  console.log("기사 계정: mover1@test.com ~ mover8@test.com");
  console.log("────────────────────────────────────");
  console.log("");
}

main()
  .catch((error: unknown) => {
    console.error("");
    console.error("❌ 시드 데이터 생성에 실패했습니다.");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
