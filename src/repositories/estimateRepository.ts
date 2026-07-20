import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";

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

export const estimateRepository = {
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
};
