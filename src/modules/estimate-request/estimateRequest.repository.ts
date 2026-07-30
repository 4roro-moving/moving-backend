import type { EstimateRequestStatus, MoveType, Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../../lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 견적 요청 조회에 공통으로 사용하는 select
 */
const estimateRequestDetailSelect = {
  id: true,
  customerId: true,
  moveType: true,
  moveDate: true,
  fromZipCode: true,
  fromAddress: true,
  fromDetailAddress: true,
  toZipCode: true,
  toAddress: true,
  toDetailAddress: true,
  status: true,
  isActive: true,
  expiresAt: true,
  createdAt: true,
  canceledAt: true,
  fromRegion: {
    select: { id: true, name: true },
  },
  toRegion: {
    select: { id: true, name: true },
  },
  designatedMovers: {
    select: {
      moverId: true,
      createdAt: true,
      mover: {
        select: {
          id: true,
          name: true,
          moverProfile: {
            select: { nickname: true, imageUrl: true },
          },
        },
      },
    },
  },
  _count: {
    select: { estimates: true },
  },
} satisfies Prisma.EstimateRequestSelect;

export type EstimateRequestDetail = Prisma.EstimateRequestGetPayload<{
  select: typeof estimateRequestDetailSelect;
}>;

/** 목록·count에 동일하게 쓰는 where (status는 선택) */
export function buildFindManyByCustomerWhere(params: {
  customerId: string;
  status?: EstimateRequestStatus;
}): Prisma.EstimateRequestWhereInput {
  return {
    customerId: params.customerId,
    ...(params.status !== undefined ? { status: params.status } : {}),
  };
}

export const estimateRequestRepository = {
  // 지역

  findRegionByName(name: string, db: Db = prisma) {
    return db.region.findUnique({
      where: { name },
      select: { id: true },
    });
  },

  // 견적 요청

  findActiveByCustomerId(customerId: string, db: Db = prisma) {
    return db.estimateRequest.findFirst({
      where: {
        customerId,
        status: { in: ["PENDING", "OPEN", "CONFIRMED"] },
        isActive: true,
      },
      select: estimateRequestDetailSelect,
      orderBy: { createdAt: "desc" },
    });
  },

  findById(estimateRequestId: number, db: Db = prisma) {
    return db.estimateRequest.findUnique({
      where: { id: estimateRequestId },
      select: estimateRequestDetailSelect,
    });
  },

  create(data: Prisma.EstimateRequestUncheckedCreateInput, db: Db = prisma) {
    return db.estimateRequest.create({
      data,
      select: estimateRequestDetailSelect,
    });
  },

  update(
    estimateRequestId: number,
    data: Prisma.EstimateRequestUncheckedUpdateInput,
    db: Db = prisma,
  ) {
    return db.estimateRequest.update({
      where: { id: estimateRequestId },
      data,
      select: estimateRequestDetailSelect,
    });
  },

  async findManyByCustomerId(
    params: {
      customerId: string;
      skip: number;
      take: number;
      status?: EstimateRequestStatus;
    },
    db: Db = prisma,
  ) {
    const where = buildFindManyByCustomerWhere({
      customerId: params.customerId,
      ...(params.status !== undefined ? { status: params.status } : {}),
    });

    const [items, totalCount] = await Promise.all([
      db.estimateRequest.findMany({
        where,
        select: estimateRequestDetailSelect,
        // createdAt 동일 시 id로 안정 정렬
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: params.skip,
        take: params.take,
      }),
      db.estimateRequest.count({ where }),
    ]);

    return { items, totalCount };
  },

  // 이력

  createHistory(data: Prisma.EstimateRequestHistoryUncheckedCreateInput, db: Db = prisma) {
    return db.estimateRequestHistory.create({ data });
  },

  // 지정 견적 요청

  findMoverForDesignation(moverId: string, db: Db = prisma) {
    return db.user.findFirst({
      where: {
        id: moverId,
        role: "MOVER",
        isActive: true,
        isProfileCompleted: true,
        deletedAt: null,
      },
      select: { id: true },
    });
  },

  countDesignations(estimateRequestId: number, db: Db = prisma) {
    return db.designatedMover.count({
      where: { estimateRequestId },
    });
  },

  findDesignation(estimateRequestId: number, moverId: string, db: Db = prisma) {
    return db.designatedMover.findUnique({
      where: {
        estimateRequestId_moverId: { estimateRequestId, moverId },
      },
      select: { id: true },
    });
  },

  createDesignation(estimateRequestId: number, moverId: string, db: Db = prisma) {
    return db.designatedMover.create({
      data: { estimateRequestId, moverId },
      select: { id: true },
    });
  },

  //* 기사님 매칭

  /**
   * 견적 요청을 전달받을 기사님 userId 목록.
   *
   * 출발지 또는 도착지 중 하나라도 서비스 지역에 포함되고,  해당 이사 유형을 취급하는 활성 기사님에게 자동으로 매침
   */
  async findMatchingMoverIds(
    params: { fromRegionId: number; toRegionId: number; moveType: MoveType },
    db: Db = prisma,
  ): Promise<string[]> {
    const profiles = await db.moverProfile.findMany({
      where: {
        user: {
          role: "MOVER",
          isActive: true,
          isProfileCompleted: true,
          deletedAt: null,
        },
        serviceTypes: {
          some: { moveType: params.moveType },
        },
        serviceAreas: {
          some: {
            regionId: { in: [params.fromRegionId, params.toRegionId] },
          },
        },
      },
      select: { userId: true },
    });

    return profiles.map((profile) => profile.userId);
  },

  // 알림 ------------------------------------------------------------------ */

  /**
   * notification 모듈이 완성되기 전까지 사용하는 임시 알림 생성.
   */
  createNotifications(data: Prisma.NotificationCreateManyInput[], db: Db = prisma) {
    return db.notification.createMany({ data });
  },
};
