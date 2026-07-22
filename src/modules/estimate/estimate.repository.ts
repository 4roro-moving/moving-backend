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
