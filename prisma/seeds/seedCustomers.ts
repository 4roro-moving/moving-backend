import type { PrismaClient } from "@prisma/client";

import { CUSTOMERS } from "./customers.js";

export async function seedCustomers(prisma: PrismaClient, passwordHash: string): Promise<void> {
  console.log("👤 고객 계정을 생성합니다.");

  for (const customer of CUSTOMERS) {
    const user = await prisma.user.upsert({
      where: {
        email: customer.email,
      },

      update: {
        password: passwordHash,
        authProvider: "LOCAL",
        providerUserId: null,
        name: customer.name,
        phone: customer.phone,
        role: "CUSTOMER",
        isActive: true,
        isProfileCompleted: true,
        deletedAt: null,
      },

      create: {
        email: customer.email,
        password: passwordHash,
        authProvider: "LOCAL",
        providerUserId: null,
        name: customer.name,
        phone: customer.phone,
        role: "CUSTOMER",
        isActive: true,
        isProfileCompleted: true,
      },
    });

    await prisma.customerProfile.upsert({
      where: {
        userId: user.id,
      },

      update: {
        nickname: customer.nickname,
        imageUrl: `https://picsum.photos/seed/customer-${customer.email}/300/300`,
      },

      create: {
        userId: user.id,
        nickname: customer.nickname,
        imageUrl: `https://picsum.photos/seed/customer-${customer.email}/300/300`,
      },
    });

    console.log(`  ✅ ${customer.email}`);
  }

  console.log(`👤 고객 계정 ${CUSTOMERS.length}개 생성 완료`);
}
