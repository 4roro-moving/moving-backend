import type { MoveType } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";
import type { MoverActivityBase } from "./profile.type";

interface CreateMoverProfileData {
  nickname: string;
  imageUrl?: string;
  career: number;
  shortIntro: string;
  description: string;
  activityBase: MoverActivityBase;
  regionIds: number[];
  serviceTypes: MoveType[];
}

interface UpdateUserData {
  name?: string;
  phone?: string;
  password?: string;
}

interface UpdateMoverProfileData {
  nickname?: string;
  imageUrl?: string | null;
  career?: number;
  shortIntro?: string;
  description?: string;
  activityBaseAddress?: string;
  activityBaseDetailAddress?: string | null;
  activityBaseZipCode?: string;
  activityBaseLatitude?: number;
  activityBaseLongitude?: number;
}

/*
 * 무버 프로필 조회 시 공통으로 포함할 관계 데이터
 */
const profileInclude = {
  user: {
    select: {
      name: true,
      email: true,
      phone: true,
    },
  },

  serviceAreas: {
    include: {
      region: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      regionId: "asc",
    },
  },

  serviceTypes: {
    select: {
      moveType: true,
    },
    orderBy: {
      moveType: "asc",
    },
  },
} as const;

/*
 * 사용자 ID로 일반 사용자 정보 조회
 *
 * 프로필 등록, 조회, 상태 조회, 프로필 정보 수정 등
 * 비밀번호가 필요하지 않은 흐름에서 사용한다.
 */
const findUserById = async (userId: string, db: DbClient = prisma) => {
  return db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      isProfileCompleted: true,
      deletedAt: true,
    },
  });
};

/*
 * 사용자 ID로 비밀번호를 포함한 사용자 정보 조회
 *
 * 기본정보 수정 중 비밀번호 변경이 요청된 경우에만 사용한다.
 */
const findUserWithPasswordById = async (userId: string, db: DbClient = prisma) => {
  return db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      phone: true,
      role: true,
      isActive: true,
      isProfileCompleted: true,
      deletedAt: true,
    },
  });
};

const hasPasswordByUserId = async (userId: string, db: DbClient = prisma): Promise<boolean> => {
  const user = await db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      password: true,
    },
  });

  return user?.password !== null;
};

/*
 * 현재 사용자를 제외하고 전화번호 중복 사용자 조회
 */
const findUserByPhoneExcludingUser = async (
  phone: string,
  userId: string,
  db: DbClient = prisma,
) => {
  return db.user.findFirst({
    where: {
      phone,
      id: {
        not: userId,
      },
    },
    select: {
      id: true,
    },
  });
};

/*
 * 사용자 ID로 무버 프로필 조회
 */
const findProfileByUserId = async (userId: string, db: DbClient = prisma) => {
  return db.moverProfile.findUnique({
    where: {
      userId,
    },
    include: profileInclude,
  });
};

/*
 * 닉네임으로 무버 프로필 조회
 */
const findProfileByNickname = async (nickname: string, db: DbClient = prisma) => {
  return db.moverProfile.findUnique({
    where: {
      nickname,
    },
    select: {
      id: true,
      userId: true,
    },
  });
};

/*
 * 현재 사용자를 제외하고 닉네임 중복 프로필 조회
 */
const findProfileByNicknameExcludingUser = async (
  nickname: string,
  userId: string,
  db: DbClient = prisma,
) => {
  return db.moverProfile.findFirst({
    where: {
      nickname,
      userId: {
        not: userId,
      },
    },
    select: {
      id: true,
      userId: true,
    },
  });
};

/*
 * 현재 기사님의 완료된 이사 수를 조회한다.
 *
 * 확정된 견적이 연결된 견적 요청 중
 * 실제 요청 상태가 COMPLETED인 건만 집계한다.
 */
const countCompletedMovesByUserId = async (
  userId: string,
  db: DbClient = prisma,
): Promise<number> => {
  return db.estimateRequest.count({
    where: {
      status: "COMPLETED",
      confirmedEstimate: {
        is: {
          moverId: userId,
        },
      },
    },
  });
};

/*
 * 전달받은 지역 ID 중 실제 존재하는 지역의 개수 조회
 */
const countRegionsByIds = async (regionIds: number[], db: DbClient = prisma): Promise<number> => {
  return db.region.count({
    where: {
      id: {
        in: regionIds,
      },
    },
  });
};

/*
 * 무버 프로필 생성
 *
 * 무버 프로필과 서비스 가능 지역, 이사 유형을 함께 생성한다.
 */
const createProfile = async (
  userId: string,
  input: CreateMoverProfileData,
  db: DbClient = prisma,
) => {
  return db.moverProfile.create({
    data: {
      userId,
      nickname: input.nickname,

      ...(input.imageUrl !== undefined && {
        imageUrl: input.imageUrl,
      }),

      career: input.career,
      shortIntro: input.shortIntro,
      description: input.description,
      activityBaseAddress: input.activityBase.address,
      activityBaseDetailAddress: input.activityBase.detailAddress ?? null,
      activityBaseZipCode: input.activityBase.zipCode,
      activityBaseLatitude: input.activityBase.latitude,
      activityBaseLongitude: input.activityBase.longitude,

      serviceAreas: {
        create: input.regionIds.map((regionId) => ({
          regionId,
        })),
      },

      serviceTypes: {
        create: input.serviceTypes.map((moveType) => ({
          moveType,
        })),
      },
    },

    include: profileInclude,
  });
};

/*
 * 사용자 기본정보 수정
 *
 * User 테이블:
 * - name
 * - phone
 * - password
 */
const updateUser = async (userId: string, data: UpdateUserData, db: DbClient = prisma) => {
  return db.user.update({
    where: {
      id: userId,
    },
    data,
  });
};

/*
 * 무버 프로필 정보 수정
 *
 * MoverProfile 테이블:
 * - nickname
 * - imageUrl
 * - career
 * - shortIntro
 * - description
 */
const updateProfile = async (
  userId: string,
  data: UpdateMoverProfileData,
  db: DbClient = prisma,
) => {
  return db.moverProfile.update({
    where: {
      userId,
    },
    data,
  });
};

/*
 * 무버 서비스 가능 지역 전체 교체
 */
const replaceServiceAreas = async (
  moverProfileId: number,
  regionIds: number[],
  db: DbClient = prisma,
): Promise<void> => {
  await db.moverServiceArea.deleteMany({
    where: {
      moverProfileId,
    },
  });

  if (regionIds.length === 0) {
    return;
  }

  await db.moverServiceArea.createMany({
    data: regionIds.map((regionId) => ({
      moverProfileId,
      regionId,
    })),
  });
};

/*
 * 무버 이사 유형 전체 교체
 */
const replaceServiceTypes = async (
  moverProfileId: number,
  serviceTypes: MoveType[],
  db: DbClient = prisma,
): Promise<void> => {
  await db.moverServiceType.deleteMany({
    where: {
      moverProfileId,
    },
  });

  if (serviceTypes.length === 0) {
    return;
  }

  await db.moverServiceType.createMany({
    data: serviceTypes.map((moveType) => ({
      moverProfileId,
      moveType,
    })),
  });
};

/*
 * 사용자 프로필 등록 완료 상태 변경
 */
const markProfileCompleted = async (userId: string, db: DbClient = prisma) => {
  return db.user.update({
    where: {
      id: userId,
    },
    data: {
      isProfileCompleted: true,
    },
  });
};

export const profileRepository = {
  findUserById,
  findUserWithPasswordById,
  hasPasswordByUserId,
  findUserByPhoneExcludingUser,
  findProfileByUserId,
  findProfileByNickname,
  findProfileByNicknameExcludingUser,
  countCompletedMovesByUserId,
  countRegionsByIds,
  createProfile,
  updateUser,
  updateProfile,
  replaceServiceAreas,
  replaceServiceTypes,
  markProfileCompleted,
};
