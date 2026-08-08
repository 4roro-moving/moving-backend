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

  await seedMovers(prisma, passwordHash, regionIdMap);

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
  console.log("  · 계정은 10명 배치로 구성, 배치 내 위치(끝자리)별 케이스 반복(~100번)");
  console.log("    - 1~2번 : 새 계정 (진행 요청·과거 이력 없음)");
  console.log("    - 3~4번 : REQUESTED (내가 견적요청, 견적 대기)");
  console.log("    - 5~6번 : QUOTED (기사 견적 도착)");
  console.log("    - 7~8번 : QUOTED (+ 과거 미작성 리뷰 보유)");
  console.log("    - 9번   : 정지된 계정");
  console.log("    - 10번  : 정지 → 해제된 계정 (현재 active)");
  console.log("  · 1~2번을 제외한 계정은 과거 완료이사 + 작성/미작성 리뷰 보유");
  console.log("  · 기사별 받은 리뷰 0~50건 랜덤 분포");
  console.log("공지 / FAQ / 문의 / 신고 / 정지 이력 / 활동 로그 생성 완료");
  console.log("");
  console.log("※ 정지 계정: customer/mover 009·019·…·099 (배치별 9번)");
  console.log("※ 정지→해제 계정: customer/mover 010·020·…·100 (배치별 10번)");
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
