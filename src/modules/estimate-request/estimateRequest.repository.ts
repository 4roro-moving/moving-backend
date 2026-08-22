import type { EstimateRequestStatus, MoveType, Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { CANCELABLE_ESTIMATE_REQUEST_STATUSES } from "./estimateRequest.constants";

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

  // 2026.08.10 정슬기 - [추가]
  // 고객이 지정한 기사님의 반려 여부·사유를 상세 응답에서 조합하기 위한 내부 조회
  rejections: {
    select: {
      moverId: true,
      reason: true,
      createdAt: true,
    },
  },

  // 2026.08.11 정슬기 - [추가]
  // 지정 기사별 견적 응답 여부를 조합하기 위한 내부 조회
  estimates: {
    select: {
      moverId: true,
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

  /**
   * 취소 가능 상태(PENDING|OPEN + isActive)인 본인 요청만 soft cancel로 선점한다.
   * count === 0 이면 이미 종료되었거나 동시 취소가 선점한 경우다.
   * // 2026.08.03 정슬기 - [추가]
   * // 2026.08.03 정슬기 - [수정] customerId·CANCELABLE 상수로 선점 조건 정렬
   */
  claimCancelEstimateRequest(
    estimateRequestId: number,
    customerId: string,
    canceledAt: Date,
    db: Db = prisma,
  ) {
    return db.estimateRequest.updateMany({
      where: {
        id: estimateRequestId,
        customerId,
        isActive: true,
        status: { in: CANCELABLE_ESTIMATE_REQUEST_STATUSES },
      },
      data: {
        status: "CANCELED",
        isActive: false,
        canceledAt,
      },
    });
  },

  /**
   * 요청 취소 시 미확정(SENT) 견적만 CANCELED 로 맞춘다. hard delete 금지.
   * // 2026.08.03 정슬기 - [추가]
   */
  cancelSentEstimatesForRequest(estimateRequestId: number, canceledAt: Date, db: Db = prisma) {
    return db.estimate.updateMany({
      where: {
        estimateRequestId,
        status: "SENT",
      },
      data: {
        status: "CANCELED",
        canceledAt,
      },
    });
  },

  /**
   * 취소 알림 대상: 아직 SENT 인 견적을 보낸 기사 ID 목록
   * (cancelSentEstimates 호출 전에 조회해야 한다)
   * // 2026.08.03 정슬기 - [추가]
   */
  async findSentEstimateMoverIds(estimateRequestId: number, db: Db = prisma): Promise<string[]> {
    const estimates = await db.estimate.findMany({
      where: {
        estimateRequestId,
        status: "SENT",
      },
      select: { moverId: true },
    });

    return estimates.map((estimate) => estimate.moverId);
  },

  findCustomerName(customerId: string, db: Db = prisma) {
    return db.user.findUnique({
      where: { id: customerId },
      select: { name: true },
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
      /*
       * serviceTypes 까지 함께 조회한다.
       * 지정 시점에 기사가 그 이사 유형을 제공하는지 대조해야 하기 때문이다.
       * (기사의 "받은 요청" 목록이 서비스 유형으로 필터링되므로,
       *  대조 없이 지정하면 알림만 가고 목록에는 안 보이는 상태가 된다)
       */
      select: {
        id: true,
        moverProfile: {
          select: {
            serviceTypes: { select: { moveType: true } },
          },
        },
      },
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

  findRejection(
    estimateRequestId: number,
    moverId: string,
    db: Db = prisma,
  ): Promise<{ id: number } | null> {
    return db.estimateRequestRejection.findUnique({
      where: {
        estimateRequestId_moverId: {
          estimateRequestId,
          moverId,
        },
      },
      select: {
        id: true,
      },
    });
  },

  createDesignation(estimateRequestId: number, moverId: string, db: Db = prisma) {
    return db.designatedMover.create({
      data: { estimateRequestId, moverId },
      select: { id: true },
    });
  },

  findEstimateByMover(estimateRequestId: number, moverId: string, db: Db = prisma) {
    return db.estimate.findUnique({
      where: {
        estimateRequestId_moverId: {
          estimateRequestId,
          moverId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });
  },

  deleteDesignation(estimateRequestId: number, moverId: string, db: Db = prisma) {
    return db.designatedMover.delete({
      where: {
        estimateRequestId_moverId: {
          estimateRequestId,
          moverId,
        },
      },
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
};
