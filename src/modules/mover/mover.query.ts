import type { Prisma } from "@prisma/client";

import type { FindManyMoversParams, MoverListSort } from "./mover.type";

export const MOVER_LIST_SELECT = {
  id: true,
  userId: true,
  nickname: true,
  imageUrl: true,
  career: true,
  shortIntro: true,
  description: true,
  confirmedCount: true,
  averageRating: true,
  reviewCount: true,
  serviceTypes: {
    select: {
      moveType: true,
    },
  },
  user: {
    select: {
      _count: {
        select: {
          favoritesReceived: true,
        },
      },
    },
  },
} satisfies Prisma.MoverProfileSelect;

export const MOVER_DETAIL_SELECT = {
  ...MOVER_LIST_SELECT,
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
} satisfies Prisma.MoverProfileSelect;

const MOVER_LIST_SORT_MAP = {
  reviewCount: { reviewCount: "desc" },
  rating: { averageRating: "desc" },
  career: { career: "desc" },
  confirmedCount: { confirmedCount: "desc" },
} satisfies Record<MoverListSort, Prisma.MoverProfileOrderByWithRelationInput>;

export function buildActiveMoverUserWhere(): Prisma.UserWhereInput {
  return {
    role: "MOVER",
    isActive: true,
    isProfileCompleted: true,
    deletedAt: null,
  };
}

export function buildMoverListWhere(params: FindManyMoversParams): Prisma.MoverProfileWhereInput {
  return {
    user: buildActiveMoverUserWhere(),
    ...(params.keyword && {
      nickname: {
        contains: params.keyword,
        mode: "insensitive",
      },
    }),
    ...(params.serviceArea && {
      serviceAreas: {
        some: {
          regionId: params.serviceArea,
        },
      },
    }),
    ...(params.moveType && {
      serviceTypes: {
        some: {
          moveType: params.moveType,
        },
      },
    }),
  };
}

export function buildMoverListOrderBy(
  sort: MoverListSort,
): Prisma.MoverProfileOrderByWithRelationInput[] {
  return [MOVER_LIST_SORT_MAP[sort], { id: "asc" }];
}
