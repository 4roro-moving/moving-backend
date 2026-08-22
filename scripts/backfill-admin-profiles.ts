/// <reference types="node" />

import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminsWithoutProfile = await prisma.user.findMany({
    where: {
      role: "ADMIN",
      adminProfile: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (adminsWithoutProfile.length === 0) {
    console.log("✅ Backfill 대상 ADMIN이 없습니다.");
    return;
  }

  console.log(`Backfill 대상 ADMIN: ${adminsWithoutProfile.length}명`);

  for (const admin of adminsWithoutProfile) {
    console.log(`- ${admin.email} (${admin.name})`);
  }

  const result = await prisma.adminProfile.createMany({
    data: adminsWithoutProfile.map((admin) => ({
      userId: admin.id,
      adminRole: "ADMIN",
    })),
    skipDuplicates: true,
  });

  console.log(`✅ AdminProfile ${result.count}건 생성 완료`);
}

main()
  .catch((error: unknown) => {
    console.error("❌ AdminProfile backfill 실패");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
