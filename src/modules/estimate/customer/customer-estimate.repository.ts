import type { Prisma } from "@prisma/client";
import { EstimateStatus } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";
import type { PendingEstimateQuery } from "./customer-estimate.type";

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

  findEstimateRequestById(estimateRequestId: number, db: DbClient = prisma) {
    return db.estimateRequest.findUnique({
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

  findReceivedEstimatesByEstimateRequestId(
    estimateRequestId: number,
    customerId: string,
    db: DbClient = prisma,
  ) {
    return db.estimate.findMany({
      where: {
        estimateRequestId,
      },
      select: getReceivedEstimateSelect(customerId),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  },

  // 2026.07.24 정슬기 - [수정] 받은 견적이 있는 요청을 패널 단위로 조회
  findReceivedEstimatePanels(customerId: string, db: DbClient = prisma) {
    return db.estimateRequest.findMany({
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
  findReceivedEstimateDetail(
    estimateRequestId: number,
    estimateId: number,
    customerId: string,
    db: DbClient = prisma,
  ) {
    return db.estimate.findFirst({
      where: {
        id: estimateId,
        estimateRequestId,
      },
      select: getReceivedEstimateDetailSelect(customerId),
    });
  },

  // 2026.07.24 정슬기 - [추가] estimateId만으로 고객 소유 견적 상세 조회 (FE /estimates/[estimateId] 대응)
  findReceivedEstimateDetailById(estimateId: number, customerId: string, db: DbClient = prisma) {
    return db.estimate.findFirst({
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
  findEstimateRequestIdByEstimateId(estimateId: number, customerId: string, db: DbClient = prisma) {
    return db.estimate.findFirst({
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

  // 기사 프로필 존재 확인
  findMoverProfileByUserId(moverId: string, db: DbClient = prisma) {
    return db.moverProfile.findUnique({
      where: {
        userId: moverId,
      },
      select: {
        id: true,
      },
    });
  },

  // 기사 확정 견적 수 증가
  incrementMoverConfirmedCount(moverId: string, db: DbClient = prisma) {
    return db.moverProfile.update({
      where: {
        userId: moverId,
      },
      data: {
        confirmedCount: {
          increment: 1,
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
