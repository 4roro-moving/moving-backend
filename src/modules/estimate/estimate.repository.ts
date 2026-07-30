import type { MoveType, Prisma } from "@prisma/client";
import { EstimateStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";
import type {
  MoverEstimateRejectionListQuery,
  MoverEstimateRequestListQuery,
  PendingEstimateQuery,
} from "./estimate.type";

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

/*
2026.07.23 add 김성현
- 받은 견적 목록 조회 필드 정의
- 받은 견적 상세 조회 필드 정의
*/

// =============================================================================
// 고객: 기사에게 받은 견적 목록·상세 조회 필드
// =============================================================================

// 2026.07.24 정슬기 - [수정] 목록에 찜 여부·찜 수를 포함해 하트 버튼 연동
function getReceivedEstimateSelect(customerId: string) {
  return {
    id: true,
    price: true,
    status: true,
    isDesignated: true,
    createdAt: true,
    mover: {
      select: {
        id: true,
        name: true,
        favoritesReceived: {
          where: {
            customerId,
          },
          select: {
            id: true,
          },
          take: 1,
        },
        moverProfile: {
          select: {
            nickname: true,
            imageUrl: true,
            career: true,
            shortIntro: true,
            averageRating: true,
            reviewCount: true,
            confirmedCount: true,
          },
        },
        _count: {
          select: {
            favoritesReceived: true,
          },
        },
      },
    },
  } satisfies Prisma.EstimateSelect;
}

// 상세 응답에 필요한 견적, 요청, 기사 필드 선택
function getReceivedEstimateDetailSelect(customerId: string) {
  return {
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
        customerId: true,
        moveType: true,
        moveDate: true,
        fromZipCode: true,
        fromAddress: true,
        fromDetailAddress: true,
        fromRegion: {
          select: {
            id: true,
            name: true,
          },
        },
        toZipCode: true,
        toAddress: true,
        toDetailAddress: true,
        toRegion: {
          select: {
            id: true,
            name: true,
          },
        },
        status: true,
        confirmedEstimateId: true,
      },
    },
    mover: {
      select: {
        id: true,
        name: true,
        moverProfile: {
          select: {
            nickname: true,
            imageUrl: true,
            career: true,
            shortIntro: true,
            description: true,
            averageRating: true,
            reviewCount: true,
            confirmedCount: true,
            serviceTypes: {
              select: {
                moveType: true,
              },
            },
            serviceAreas: {
              select: {
                region: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        favoritesReceived: {
          where: {
            customerId,
          },
          select: {
            id: true,
          },
          take: 1,
        },
        _count: {
          select: {
            favoritesReceived: true,
          },
        },
      },
    },
  } satisfies Prisma.EstimateSelect;
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

  findMany(params: FindManyParams) {
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
      designatedMovers: {
        select: {
          moverId: true,
        },
      },
    };

    if (params.cursorId) {
      return prisma.estimateRequest.findMany({
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

    return prisma.estimateRequest.findMany({
      where,
      select,
      orderBy,
      take: params.query.limit + 1,
    });
  },

  count(params: FindManyParams) {
    return prisma.estimateRequest.count({
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
        //현재 기사 지정 됐는지
        designatedMovers: {
          where: {
            moverId,
          },
          select: {
            id: true,
          },
        },
        //현재 기사가 이미 보낸 견적이 있는지
        estimates: {
          where: {
            moverId,
          },
          select: {
            id: true,
          },
        },
        //현재 기사가 이미 반려했는지
        rejections: {
          where: {
            moverId,
          },
          select: {
            id: true,
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
      where: { moverId },
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
            designatedMovers: {
              where: { moverId },
              select: { id: true },
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

// =============================================================================
// 고객: 기사에게 받은 견적 목록·상세 조회 및 견적 확정
// =============================================================================

// 고객 견적 요청 기준 받은 견적 조회
export const receivedEstimateRepository = {
  // 고객의 확정 전 견적 요청과 받은 견적 목록 조회
  findPendingEstimateRequests(
    customerId: string,
    query: PendingEstimateQuery,
    referenceDate: Date,
    db: DbClient = prisma,
  ) {
    const where: Prisma.EstimateRequestWhereInput = {
      customerId,
      isActive: true,
      status: {
        in: ["PENDING", "OPEN"],
      },
      confirmedEstimateId: null,
      expiresAt: {
        gt: referenceDate,
      },
    };

    return Promise.all([
      db.estimateRequest.findMany({
        where,
        select: {
          id: true,
          customerId: true,
          moveType: true,
          moveDate: true,
          fromZipCode: true,
          fromAddress: true,
          fromDetailAddress: true,
          fromRegion: {
            select: {
              id: true,
              name: true,
            },
          },
          toZipCode: true,
          toAddress: true,
          toDetailAddress: true,
          toRegion: {
            select: {
              id: true,
              name: true,
            },
          },
          status: true,
          isActive: true,
          createdAt: true,
          expiresAt: true,
          canceledAt: true,
          confirmedEstimateId: true,
          designatedMovers: {
            select: {
              moverId: true,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          },
          estimates: {
            where: {
              status: EstimateStatus.SENT,
            },
            select: getReceivedEstimateSelect(customerId),
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          },
          _count: {
            select: {
              estimates: {
                where: {
                  status: EstimateStatus.SENT,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      db.estimateRequest.count({
        where,
      }),
    ]);
  },

  findEstimateRequestById(estimateRequestId: number) {
    return prisma.estimateRequest.findUnique({
      where: {
        id: estimateRequestId,
      },
      select: {
        id: true,
        customerId: true,
        moveType: true,
        moveDate: true,
        fromAddress: true,
        toAddress: true,
        status: true,
        createdAt: true,
        confirmedEstimateId: true,
      },
    });
  },

  findReceivedEstimatesByEstimateRequestId(estimateRequestId: number, customerId: string) {
    return prisma.estimate.findMany({
      where: {
        estimateRequestId,
      },
      select: getReceivedEstimateSelect(customerId),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  },

  // 2026.07.24 정슬기 - [수정] 받은 견적이 있는 요청을 패널 단위로 조회
  findReceivedEstimatePanels(customerId: string) {
    return prisma.estimateRequest.findMany({
      where: {
        customerId,
        estimates: {
          some: {
            status: {
              in: [EstimateStatus.SENT, EstimateStatus.CONFIRMED],
            },
          },
        },
      },
      select: {
        id: true,
        moveType: true,
        moveDate: true,
        fromAddress: true,
        toAddress: true,
        status: true,
        createdAt: true,
        confirmedEstimateId: true,
        estimates: {
          where: {
            status: {
              in: [EstimateStatus.SENT, EstimateStatus.CONFIRMED],
            },
          },
          select: getReceivedEstimateSelect(customerId),
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  },

  // 견적 요청에 속한 받은 견적 상세 조회
  findReceivedEstimateDetail(estimateRequestId: number, estimateId: number, customerId: string) {
    return prisma.estimate.findFirst({
      where: {
        id: estimateId,
        estimateRequestId,
      },
      select: getReceivedEstimateDetailSelect(customerId),
    });
  },

  // 2026.07.24 정슬기 - [추가] estimateId만으로 고객 소유 견적 상세 조회 (FE /estimates/[estimateId] 대응)
  findReceivedEstimateDetailById(estimateId: number, customerId: string) {
    return prisma.estimate.findFirst({
      where: {
        id: estimateId,
        estimateRequest: {
          customerId,
        },
      },
      select: getReceivedEstimateDetailSelect(customerId),
    });
  },

  // 확정할 받은 견적 조회
  findReceivedEstimateForConfirm(
    estimateRequestId: number,
    estimateId: number,
    db: DbClient = prisma,
  ) {
    return db.estimate.findFirst({
      where: {
        id: estimateId,
        estimateRequestId,
      },
      select: {
        id: true,
        price: true,
        status: true,
        confirmedAt: true,
        estimateRequest: {
          select: {
            id: true,
            customerId: true,
            moveDate: true,
            customer: {
              select: {
                name: true,
              },
            },
            status: true,
            confirmedEstimateId: true,
          },
        },
        mover: {
          select: {
            id: true,
            name: true,
            moverProfile: {
              select: {
                nickname: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });
  },

  // 2026.07.24 정슬기 - [추가] estimateId만으로 확정에 필요한 requestId를 해석
  findEstimateRequestIdByEstimateId(estimateId: number, customerId: string) {
    return prisma.estimate.findFirst({
      where: {
        id: estimateId,
        estimateRequest: {
          customerId,
        },
      },
      select: {
        id: true,
        estimateRequestId: true,
      },
    });
  },

  // 선택 견적 확정
  confirmEstimate(estimateId: number, confirmedAt: Date, db: DbClient = prisma) {
    return db.estimate.update({
      where: {
        id: estimateId,
      },
      data: {
        status: "CONFIRMED",
        confirmedAt,
      },
      select: {
        id: true,
        price: true,
        status: true,
        confirmedAt: true,
        mover: {
          select: {
            id: true,
            name: true,
            moverProfile: {
              select: {
                nickname: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });
  },

  // 미선택 견적 만료 처리
  expireOtherSentEstimates(
    estimateRequestId: number,
    estimateId: number,
    expiredAt: Date,
    db: DbClient = prisma,
  ) {
    return db.estimate.updateMany({
      where: {
        estimateRequestId,
        id: {
          not: estimateId,
        },
        status: "SENT",
      },
      data: {
        status: "EXPIRED",
        expiredAt,
      },
    });
  },

  // 견적 요청 확정 가능 상태 선점
  claimEstimateRequestForConfirm(
    estimateRequestId: number,
    estimateId: number,
    db: DbClient = prisma,
  ) {
    return db.estimateRequest.updateMany({
      where: {
        id: estimateRequestId,
        status: "OPEN",
        confirmedEstimateId: null,
      },
      data: {
        status: "CONFIRMED",
        confirmedEstimateId: estimateId,
      },
    });
  },

  // 확정된 견적 요청 조회
  findConfirmedEstimateRequestById(estimateRequestId: number, db: DbClient = prisma) {
    return db.estimateRequest.findUnique({
      where: {
        id: estimateRequestId,
      },
      select: {
        id: true,
        status: true,
        confirmedEstimateId: true,
      },
    });
  },

  // 견적 요청 이력 생성
  createEstimateRequestHistory(
    data: Prisma.EstimateRequestHistoryUncheckedCreateInput,
    db: DbClient = prisma,
  ) {
    return db.estimateRequestHistory.create({
      data,
    });
  },
};
