import type { PrismaClient } from "@prisma/client";

import { MOVERS } from "./movers.js";

export async function seedMovers(
  prisma: PrismaClient,
  passwordHash: string,
  regionIdMap: Map<string, number>,
  adminId: string | null,
): Promise<void> {
  console.log("기사님 계정을 생성합니다.");

  for (const mover of MOVERS) {
    const user = await prisma.user.upsert({
      where: {
        email: mover.email,
      },

      update: {
        password: passwordHash,
        authProvider: "LOCAL",
        providerUserId: null,
        name: mover.name,
        phone: mover.phone,
        role: "MOVER",
        isActive: true,
        isProfileCompleted: true,
        deletedAt: null,
      },

      create: {
        email: mover.email,
        password: passwordHash,
        authProvider: "LOCAL",
        providerUserId: null,
        name: mover.name,
        phone: mover.phone,
        role: "MOVER",
        isActive: true,
        isProfileCompleted: true,
      },
    });

    const moverProfile = await prisma.moverProfile.upsert({
      where: {
        userId: user.id,
      },

      update: {
        nickname: mover.nickname,
        imageUrl: `https://picsum.photos/seed/mover-${mover.email}/300/300`,
        career: mover.career,
        shortIntro: mover.shortIntro,
        description: mover.description,
        confirmedCount: mover.confirmedCount,
        averageRating: mover.averageRating,
        reviewCount: mover.reviewCount,
        businessNumber: mover.businessNumber,
        businessName: mover.businessName,
        licenseFileKey: `mover-licenses/${mover.email}.jpg`,
        approvalStatus: mover.approvalStatus,
        approvedBy: mover.approvalStatus === "PENDING" ? null : adminId,
        approvedAt: mover.approvalStatus === "PENDING" ? null : new Date(),
        rejectReason: "rejectReason" in mover ? mover.rejectReason : null,
      },

      create: {
        userId: user.id,
        nickname: mover.nickname,
        imageUrl: `https://picsum.photos/seed/mover-${mover.email}/300/300`,
        career: mover.career,
        shortIntro: mover.shortIntro,
        description: mover.description,
        confirmedCount: mover.confirmedCount,
        averageRating: mover.averageRating,
        reviewCount: mover.reviewCount,
        businessNumber: mover.businessNumber,
        businessName: mover.businessName,
        licenseFileKey: `mover-licenses/${mover.email}.jpg`,
        approvalStatus: mover.approvalStatus,
        approvedBy: mover.approvalStatus === "PENDING" ? null : adminId,
        approvedAt: mover.approvalStatus === "PENDING" ? null : new Date(),
        rejectReason: "rejectReason" in mover ? mover.rejectReason : null,
      },
    });

    await prisma.moverServiceArea.deleteMany({
      where: {
        moverProfileId: moverProfile.id,
      },
    });

    await prisma.moverServiceType.deleteMany({
      where: {
        moverProfileId: moverProfile.id,
      },
    });

    const serviceAreas = mover.regions.map((regionName) => {
      const regionId = regionIdMap.get(regionName);

      if (regionId === undefined) {
        throw new Error(`${mover.nickname} 기사님의 지역을 찾을 수 없습니다: ${regionName}`);
      }

      return {
        moverProfileId: moverProfile.id,
        regionId,
      };
    });

    await prisma.moverServiceArea.createMany({
      data: serviceAreas,
      skipDuplicates: true,
    });

    await prisma.moverServiceType.createMany({
      data: mover.moveTypes.map((moveType) => ({
        moverProfileId: moverProfile.id,
        moveType,
      })),
      skipDuplicates: true,
    });

    console.log(`  ✅ ${mover.email} / ${mover.nickname}`);
  }

  console.log(`🚚 기사님 계정 ${MOVERS.length}개 생성 완료`);
}
