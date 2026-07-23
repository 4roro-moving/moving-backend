import type { MoveType, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { MoverEstimateRequestListQuery } from "./estimate.type";

type FindManyParams = {
  moverId: string;
  moverMoveTypes: MoveType[];
  moverRegionIds: number[];
  query: MoverEstimateRequestListQuery;
  cursorId: number | undefined;
};

/* 
2026.07.23 add 김성현
- 받은 견적 목록 조회 필드 정의
- 받은 견적 상세 조회 필드 정의
*/

const receivedEstimateSelect = {
  id: true,
  price: true,
  status: true,
  isDesignated: true,
  createdAt: true,
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
          averageRating: true,
          reviewCount: true,
          confirmedCount: true,
        },
      },
    },
  },
} satisfies Prisma.EstimateSelect;

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

export const moverEstimateRequestRepository = {
  findMoverProfile(moverId: string) {
    return prisma.moverProfile.findFirst({
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
    const where: Prisma.EstimateRequestWhereInput = {
      status: "OPEN",
      isActive: true,
      expiresAt: {
        gt: new Date(),
      },
      moveType: {
        in: params.moverMoveTypes,
      },
      estimates: {
        none: {
          moverId: params.moverId,
        },
      },
      rejections: {
        none: {
          moverId: params.moverId,
        },
      },
    };

    if (params.query.keyword) {
      where.customer = {
        name: {
          contains: params.query.keyword,
          mode: "insensitive",
        },
      };
    }

    if (params.query.isDesignated === true) {
      where.designatedMovers = {
        some: {
          moverId: params.moverId,
        },
      };
    }

    if (params.query.isDesignated === false) {
      where.designatedMovers = {
        none: {
          moverId: params.moverId,
        },
      };
    }

    if (params.query.isServiceArea === true) {
      where.OR = [
        {
          fromRegionId: {
            in: params.moverRegionIds,
          },
        },
        {
          toRegionId: {
            in: params.moverRegionIds,
          },
        },
      ];
    }

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
};

// 고객 견적 요청 기준 받은 견적 조회
export const receivedEstimateRepository = {
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
      },
    });
  },

  findReceivedEstimatesByEstimateRequestId(estimateRequestId: number) {
    return prisma.estimate.findMany({
      where: {
        estimateRequestId,
      },
      select: receivedEstimateSelect,
      orderBy: {
        createdAt: "desc",
      },
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
};
