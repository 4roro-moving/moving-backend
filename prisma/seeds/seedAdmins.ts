import type { PrismaClient } from "@prisma/client";

import { ADMINS } from "./admins.js";

/**
 * 관리자 계정을 생성합니다.
 */
export async function seedAdmins(prisma: PrismaClient, passwordHash: string): Promise<string[]> {
  console.log("관리자 계정을 생성합니다.");

  const adminIds: string[] = [];

  for (const admin of ADMINS) {
    const user = await prisma.user.upsert({
      where: {
        email: admin.email,
      },

      update: {
        password: passwordHash,
        authProvider: "LOCAL",
        providerUserId: null,
        name: admin.name,
        phone: admin.phone,
        role: "ADMIN",
        isActive: true,
        isProfileCompleted: true,
        deletedAt: null,
      },

      create: {
        email: admin.email,
        password: passwordHash,
        authProvider: "LOCAL",
        providerUserId: null,
        name: admin.name,
        phone: admin.phone,
        role: "ADMIN",
        isActive: true,
        isProfileCompleted: true,
      },
    });

    adminIds.push(user.id);

    console.log(`  ✅ ${admin.email}`);
  }

  console.log(`🛠️  관리자 계정 ${ADMINS.length}개 생성 완료`);

  return adminIds;
}
