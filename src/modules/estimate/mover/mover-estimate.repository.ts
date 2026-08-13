import type { MoveType, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";
import type {
  MoverEstimateRejectionListQuery,
  MoverEstimateRequestListQuery,
  MoverSentEstimateListQuery,
} from "./mover-estimate.type";

type FindManyParams = {
  moverId: string;
  moverMoveTypes: MoveType[];
  moverRegionIds: number[];
  query: MoverEstimateRequestListQuery;
  cursorId: number | undefined;
  referenceDate: Date;
};

//기사 - 견적 생성
type CreateEstimateData = {
  estimateRequestId: number;
  moverId: string;
  price: number;
  comment: string;
  isDesignated: boolean;
};

// 기사 - 견적 요청 반려 생성
type CreateEstimateRejectionData = {
  estimateRequestId: number;
  moverId: string;
  reason: string;
};

// =============================================================================
// 기사: 고객의 견적 요청 목록 조회 조건
// =============================================================================

function buildMoverEstimateRequestWhere(params: FindManyParams): Prisma.EstimateRequestWhereInput {
  const where: Prisma.EstimateRequestWhereInput = {
    status: "OPEN",
    isActive: true,
    expiresAt: { gt: params.referenceDate },
    moveType: { in: params.moverMoveTypes },
    estimates: { none: { moverId: params.moverId } },
    rejections: { none: { moverId: params.moverId } },
  };

  if (params.query.keyword) {
    where.customer = {
      name: { contains: params.query.keyword, mode: "insensitive" },
    };
  }

  if (params.query.isDesignated === true) {
    where.designatedMovers = { some: { moverId: params.moverId } };
  }

  if (params.query.isDesignated === false) {
    where.designatedMovers = { none: { moverId: params.moverId } };
  }

  if (params.query.isServiceArea === true) {
    where.OR = [
      { fromRegionId: { in: params.moverRegionIds } },
      { toRegionId: { in: params.moverRegionIds } },
    ];
  }

  return where;
}

// =============================================================================
// 기사: 고객의 견적 요청 목록 조회
// =============================================================================

/*
기존 목록 조회 : findMoverProfile(moverId);
견적 제안 : findMoverProfile(moverId, tx);
 */
export const moverEstimateRequestRepository = {
  findMoverProfile(moverId: string, db: DbClient = prisma) {
    return db.moverProfile.findFirst({
      where: {
        userId: moverId,
        user: {
          isActive: true,
          deletedAt: null,
        },
      },
      select: {
        nickname: true,
        serviceTypes: {
          select: {
            moveType: true,
          },
        },
        serviceAreas: {
          select: {
            regionId: true,
          },
        },
      },
    });
  },

  findMany(params: FindManyParams, db: DbClient = prisma) {
    const where = buildMoverEstimateRequestWhere(params);

    let orderBy: Prisma.EstimateRequestOrderByWithRelationInput[] = [
      { createdAt: "desc" },
      { id: "desc" },
    ];

    if (params.query.sort === "moveDate") {
      orderBy = [{ moveDate: "asc" }, { id: "asc" }];
    }

    const select = {
      id: true,
      moveType: true,
      moveDate: true,
      fromAddress: true,
      toAddress: true,
      createdAt: true,
      customer: {
        select: {
          id: true,
          name: true,
        },
      },
      fromRegion: {
        select: {
          name: true,
        },
      },
      toRegion: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          designatedMovers: {
            where: {
              moverId: params.moverId,
            },
          },
        },
      },
    };

    if (params.cursorId) {
      return db.estimateRequest.findMany({
        where,
        select,
        orderBy,
        take: params.query.limit + 1,
        cursor: {
          id: params.cursorId,
        },
        skip: 1,
      });
    }

    return db.estimateRequest.findMany({
      where,
      select,
      orderBy,
      take: params.query.limit + 1,
    });
  },

  count(params: FindManyParams, db: DbClient = prisma) {
    return db.estimateRequest.count({
      where: buildMoverEstimateRequestWhere(params),
    });
  },

  // 기사 작업 전 요청 상태, 지정 여부, 기존 견적, 반려 여부 조회
  findEstimateRequestForMoverAction(
    estimateRequestId: number,
    moverId: string,
    db: DbClient = prisma,
  ) {
    return db.estimateRequest.findUnique({
      where: {
        id: estimateRequestId,
      },
      select: {
        id: true,
        customerId: true,
        moveType: true,
        status: true,
        isActive: true,
        expiresAt: true,
        confirmedEstimateId: true,
        _count: {
          select: {
            designatedMovers: {
              where: {
                moverId,
              },
            },
            estimates: {
              where: {
                moverId,
              },
            },
            rejections: {
              where: {
                moverId,
              },
            },
          },
        },
      },
    });
  },

  createEstimate(data: CreateEstimateData, db: DbClient = prisma) {
    return db.estimate.create({
      data: {
        estimateRequestId: data.estimateRequestId,
        moverId: data.moverId,
        price: data.price,
        comment: data.comment,
        isDesignated: data.isDesignated,
        status: "SENT",
      },
      select: {
        id: true,
        estimateRequestId: true,
        moverId: true,
        price: true,
        comment: true,
        status: true,
        isDesignated: true,
        createdAt: true,
      },
    });
  },

  createEstimateRejection(data: CreateEstimateRejectionData, db: DbClient = prisma) {
    return db.estimateRequestRejection.create({
      data: {
        estimateRequestId: data.estimateRequestId,
        moverId: data.moverId,
        reason: data.reason,
      },
      select: {
        id: true,
        estimateRequestId: true,
        moverId: true,
        reason: true,
        createdAt: true,
      },
    });
  },

  //기사 견적 반려 내역 조회
  findRejections(moverId: string, query: MoverEstimateRejectionListQuery, db: DbClient = prisma) {
    return db.estimateRequestRejection.findMany({
      where: {
        moverId,
        estimateRequest: { status: { not: "CANCELED" } },
      },
      select: {
        id: true,
        reason: true,
        createdAt: true,
        estimateRequest: {
          select: {
            id: true,
            moveType: true,
            moveDate: true,
            fromAddress: true,
            toAddress: true,
            customer: {
              select: {
                id: true,
                name: true,
              },
            },
            fromRegion: {
              select: {
                name: true,
              },
            },
            toRegion: {
              select: {
                name: true,
              },
            },
            _count: {
              select: {
                designatedMovers: {
                  where: { moverId },
                },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: Number(query.cursor) },
            skip: 1,
          }
        : {}),
    });
  },
};

const moverSentEstimateSelect = {
  id: true,
  price: true,
  comment: true,
  status: true,
  isDesignated: true,
  createdAt: true,
  updatedAt: true,
  confirmedAt: true,
  estimateRequest: {
    select: {
      id: true,
      moveType: true,
      moveDate: true,
      fromZipCode: true,
      fromAddress: true,
      fromDetailAddress: true,
      fromRegion: { select: { id: true, name: true } },
      toZipCode: true,
      toAddress: true,
      toDetailAddress: true,
      toRegion: { select: { id: true, name: true } },
      status: true,
      confirmedEstimateId: true,
      createdAt: true,
      completedAt: true,
      customer: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.EstimateSelect;

function buildMoverSentEstimateWhere(
  moverId: string,
  query: MoverSentEstimateListQuery,
): Prisma.EstimateWhereInput {
  const where: Prisma.EstimateWhereInput = {
    moverId,
    estimateRequest: { status: { not: "CANCELED" } },
  };

  if (query.status === "COMPLETED") {
    where.estimateRequest = { status: "COMPLETED" };
  } else if (query.status === "CONFIRMED") {
    where.status = "CONFIRMED";
    where.estimateRequest = { status: { notIn: ["COMPLETED", "CANCELED"] } };
  } else if (query.status === "SENT") {
    where.status = { not: "CONFIRMED" };
    where.estimateRequest = { status: { notIn: ["COMPLETED", "CANCELED"] } };
  }

  return where;
}

export const moverSentEstimateRepository = {
  findMany(moverId: string, query: MoverSentEstimateListQuery, db: DbClient = prisma) {
    const where = buildMoverSentEstimateWhere(moverId, query);
    return Promise.all([
      db.estimate.findMany({
        where,
        select: moverSentEstimateSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      db.estimate.count({ where }),
    ]);
  },

  findDetail(moverId: string, estimateId: number, db: DbClient = prisma) {
    return db.estimate.findFirst({
      where: { id: estimateId, moverId },
      select: moverSentEstimateSelect,
    });
  },

  completeConfirmedRequest(
    estimateRequestId: number,
    estimateId: number,
    completedAt: Date,
    db: DbClient = prisma,
  ) {
    return db.estimateRequest.updateMany({
      where: {
        id: estimateRequestId,
        status: "CONFIRMED",
        confirmedEstimateId: estimateId,
      },
      data: {
        status: "COMPLETED",
        isActive: false,
        completedAt,
      },
    });
  },
};
