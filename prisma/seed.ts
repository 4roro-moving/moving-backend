import "dotenv/config";

import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

import { SALT_ROUNDS, TEST_PASSWORD } from "./seeds/constants.js";
import { seedAdminContents } from "./seeds/seedAdminContents.js";
import { seedAdmins } from "./seeds/seedAdmins.js";
import { seedCustomers } from "./seeds/seedCustomers.js";
import { seedEstimateData } from "./seeds/seedEstimateData.js";
import { seedMovers } from "./seeds/seedMovers.js";
import { seedRegions } from "./seeds/seedRegions.js";
import { seedReviews } from "./seeds/seedReviews.js";
import { seedTerms } from "./seeds/seedTerms.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("");
  console.log("무빙 프로젝트 시드 데이터 생성을 시작합니다.");
  console.log("");

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);

  const regionIdMap = await seedRegions(prisma);

  console.log("");

  const adminIds = await seedAdmins(prisma, passwordHash);

  console.log("");

  await seedCustomers(prisma, passwordHash);

  console.log("");

  await seedMovers(prisma, passwordHash, regionIdMap, adminIds[0] ?? null);

  console.log("");

  // 확정 견적 ref를 받아 바로 아래에서 Review row를 만듭니다.
  const confirmedEstimates = await seedEstimateData(prisma, regionIdMap);

  console.log("");

  // Review는 estimateId FK가 필요하므로 견적 시드 이후에 실행합니다.
  // admin 신고 시드(seedAdminContents)가 리뷰 id를 쓰므로 그 전에 둡니다.
  await seedReviews(prisma, confirmedEstimates);

  console.log("");

  await seedAdminContents(prisma, adminIds);

  console.log("");

  await seedTerms(prisma, adminIds);

  console.log("");
  console.log("🎉 시드 데이터 생성이 완료되었습니다.");
  console.log("");
  console.log("────────────────────────────────────");
  console.log(`공통 비밀번호: ${TEST_PASSWORD}`);
  console.log("관리자 계정: admin1@test.com ~ admin10@test.com");
  console.log("고객 계정: customer001@test.com ~ customer100@test.com");
  console.log("기사 계정: mover001@test.com ~ mover100@test.com");
  console.log("견적 요청 및 견적 테스트 데이터 생성 완료");
  console.log("리뷰 테스트 데이터 생성 완료");
  console.log("  · 고객별 완료 이사 2건(리뷰 작성 1건 + 리뷰 미작성 1건) 생성");
  console.log("공지 / FAQ / 문의 / 신고 / 정지 이력 / 활동 로그 생성 완료");
  console.log("");
  console.log("※ customer003@test.com 은 정지 상태로 생성됩니다.");
  console.log("────────────────────────────────────");
  console.log("");
}

main()
  .catch((error: unknown) => {
    console.error("");
    console.error("시드 데이터 생성에 실패했습니다.");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
