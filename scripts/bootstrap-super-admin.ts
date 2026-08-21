/// <reference types="node" />

import "dotenv/config";

import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

async function main(): Promise<void> {
  const email = requireEnv("SUPER_ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("SUPER_ADMIN_PASSWORD");
  const name = requireEnv("SUPER_ADMIN_NAME");
  const phone = requireEnv("SUPER_ADMIN_PHONE");

  const existingSuperAdmin = await prisma.adminProfile.findFirst({
    where: {
      adminRole: "SUPER_ADMIN",
    },
    select: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (existingSuperAdmin) {
    throw new Error(`SUPER_ADMIN이 이미 존재합니다. (${existingSuperAdmin.user.email})`);
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    throw new Error(`이미 사용 중인 이메일입니다. (${email})`);
  }

  const existingPhone = await prisma.user.findUnique({
    where: {
      phone,
    },
    select: {
      id: true,
    },
  });

  if (existingPhone) {
    throw new Error(`이미 사용 중인 휴대폰 번호입니다. (${phone})`);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const superAdmin = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password: passwordHash,
        authProvider: "LOCAL",
        providerUserId: null,
        name,
        phone,
        role: "ADMIN",
        isActive: true,
        isProfileCompleted: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    await tx.adminProfile.create({
      data: {
        userId: user.id,
        adminRole: "SUPER_ADMIN",
      },
    });

    return user;
  });

  console.log("✅ SUPER_ADMIN 생성 완료");
  console.log(`- email: ${superAdmin.email}`);
  console.log(`- name: ${superAdmin.name}`);
}

main()
  .catch((error: unknown) => {
    console.error("❌ SUPER_ADMIN 생성 실패");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
