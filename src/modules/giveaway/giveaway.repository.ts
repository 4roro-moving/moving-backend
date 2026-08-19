import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";
import { GIVEAWAY_REQUEST_STATUS, GIVEAWAY_STATUS, GIVEAWAY_VISIBILITY } from "./giveaway.type";
import type { GiveawayRequestStatusValue } from "./giveaway.type";

const authorSelect = {
  id: true,
  name: true,
} satisfies Prisma.UserSelect;

const regionSelect = {
  id: true,
  name: true,
} satisfies Prisma.RegionSelect;

const imageSelect = {
  id: true,
  imageKey: true,
  sortOrder: true,
} satisfies Prisma.GiveawayImageSelect;

const giveawayListSelect = {
  id: true,
  title: true,
  status: true,
  isHidden: true,
  createdAt: true,
  updatedAt: true,
  author: { select: authorSelect },
  region: { select: regionSelect },
  images: {
    select: imageSelect,
    orderBy: { sortOrder: "asc" },
    take: 1,
  },
  _count: {
    select: {
      requests: {
        where: {
          status: {
            in: [GIVEAWAY_REQUEST_STATUS.PENDING, GIVEAWAY_REQUEST_STATUS.SELECTED],
          },
        },
      },
    },
  },
} satisfies Prisma.GiveawaySelect;

const giveawayDetailSelect = {
  id: true,
  authorId: true,
  receiverId: true,
  title: true,
  description: true,
  status: true,
  isHidden: true,
  createdAt: true,
  updatedAt: true,
  author: { select: authorSelect },
  receiver: { select: authorSelect },
  region: { select: regionSelect },
  images: {
    select: imageSelect,
    orderBy: { sortOrder: "asc" },
  },
  _count: {
    select: {
      requests: {
        where: {
          status: {
            in: [GIVEAWAY_REQUEST_STATUS.PENDING, GIVEAWAY_REQUEST_STATUS.SELECTED],
          },
        },
      },
    },
  },
} satisfies Prisma.GiveawaySelect;

const giveawayOwnershipSelect = {
  id: true,
  authorId: true,
  receiverId: true,
  status: true,
  isHidden: true,
} satisfies Prisma.GiveawaySelect;

const requestSelect = {
  id: true,
  giveawayId: true,
  requesterId: true,
  status: true,
  message: true,
  createdAt: true,
  updatedAt: true,
  requester: { select: authorSelect },
} satisfies Prisma.GiveawayRequestSelect;

const myRequestSelect = {
  ...requestSelect,
  giveaway: {
    select: {
      id: true,
      title: true,
      status: true,
      isHidden: true,
      author: { select: authorSelect },
      region: { select: regionSelect },
      images: {
        select: imageSelect,
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
  },
} satisfies Prisma.GiveawayRequestSelect;

export type GiveawayListRow = Prisma.GiveawayGetPayload<{ select: typeof giveawayListSelect }>;
export type GiveawayDetailRow = Prisma.GiveawayGetPayload<{ select: typeof giveawayDetailSelect }>;
export type GiveawayOwnershipRow = Prisma.GiveawayGetPayload<{
  select: typeof giveawayOwnershipSelect;
}>;
export type GiveawayRequestRow = Prisma.GiveawayRequestGetPayload<{ select: typeof requestSelect }>;
export type MyGiveawayRequestRow = Prisma.GiveawayRequestGetPayload<{
  select: typeof myRequestSelect;
}>;

type ListGiveawayParams = {
  skip: number;
  take: number;
  where: Prisma.GiveawayWhereInput;
};

type ListRequestParams = {
  skip: number;
  take: number;
  where: Prisma.GiveawayRequestWhereInput;
};

type CreateGiveawayData = {
  authorId: string;
  title: string;
  description: string;
  regionId?: number;
  images: Array<{ imageKey: string; sortOrder: number }>;
};

type UpdateGiveawayData = {
  title?: string;
  description?: string;
  regionId?: number | null;
  images?: Array<{ imageKey: string; sortOrder: number }>;
};

function findGiveawayById(giveawayId: number, db: DbClient = prisma) {
  return db.giveaway.findUnique({
    where: { id: giveawayId },
    select: giveawayDetailSelect,
  });
}

function findGiveawayOwnership(giveawayId: number, db: DbClient = prisma) {
  return db.giveaway.findUnique({
    where: { id: giveawayId },
    select: giveawayOwnershipSelect,
  });
}

function findRegionById(regionId: number, db: DbClient = prisma) {
  return db.region.findUnique({
    where: { id: regionId },
    select: { id: true },
  });
}

async function findGiveawaysWithCount(
  { skip, take, where }: ListGiveawayParams,
  db: DbClient = prisma,
) {
  const [giveaways, totalCount] = await Promise.all([
    db.giveaway.findMany({
      where,
      select: giveawayListSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    db.giveaway.count({ where }),
  ]);

  return { giveaways, totalCount };
}

async function createGiveaway(data: CreateGiveawayData, db: DbClient = prisma) {
  const createData: Prisma.GiveawayUncheckedCreateInput = {
    authorId: data.authorId,
    title: data.title,
    description: data.description,
    status: GIVEAWAY_STATUS.AVAILABLE,
    isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
    images: {
      create: data.images,
    },
  };

  if (data.regionId !== undefined) {
    createData.regionId = data.regionId;
  }

  return db.giveaway.create({
    data: createData,
    select: giveawayDetailSelect,
  });
}

async function updateGiveaway(giveawayId: number, data: UpdateGiveawayData, db: DbClient = prisma) {
  const updateData: Prisma.GiveawayUncheckedUpdateInput = {};

  if (data.title !== undefined) {
    updateData.title = data.title;
  }

  if (data.description !== undefined) {
    updateData.description = data.description;
  }

  if (data.regionId !== undefined) {
    updateData.regionId = data.regionId;
  }

  if (data.images !== undefined) {
    // deleteMany 빈값으로 중첩 쓰기 삭제 (이전: delete, update 두 번 처리함)
    updateData.images = {
      deleteMany: {},
      create: data.images,
    };
  }

  return db.giveaway.update({
    where: { id: giveawayId },
    data: updateData,
    select: giveawayDetailSelect,
  });
}

async function deleteGiveaway(giveawayId: number, db: DbClient = prisma) {
  await db.giveaway.delete({
    where: { id: giveawayId },
  });
}

async function markGiveawayInProgress(
  params: { giveawayId: number; authorId: string; receiverId: string },
  db: DbClient = prisma,
) {
  const { count } = await db.giveaway.updateMany({
    where: {
      id: params.giveawayId,
      authorId: params.authorId,
      status: GIVEAWAY_STATUS.AVAILABLE,
      isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
    },
    data: {
      receiverId: params.receiverId,
      status: GIVEAWAY_STATUS.IN_PROGRESS,
    },
  });

  return count > 0;
}

async function completeGiveaway(
  params: { giveawayId: number; authorId: string },
  db: DbClient = prisma,
) {
  const { count } = await db.giveaway.updateMany({
    where: {
      id: params.giveawayId,
      authorId: params.authorId,
      status: GIVEAWAY_STATUS.IN_PROGRESS,
    },
    data: {
      status: GIVEAWAY_STATUS.COMPLETED,
    },
  });

  return count > 0;
}

async function restoreGiveawayToAvailable(
  params: { giveawayId: number; receiverId: string },
  db: DbClient = prisma,
) {
  const { count } = await db.giveaway.updateMany({
    where: {
      id: params.giveawayId,
      receiverId: params.receiverId,
      status: GIVEAWAY_STATUS.IN_PROGRESS,
    },
    data: {
      receiverId: null,
      status: GIVEAWAY_STATUS.AVAILABLE,
    },
  });

  return count > 0;
}

function findRequestById(requestId: number, db: DbClient = prisma) {
  return db.giveawayRequest.findUnique({
    where: { id: requestId },
    select: requestSelect,
  });
}

function findRequestByGiveawayAndRequester(
  params: { giveawayId: number; requesterId: string },
  db: DbClient = prisma,
) {
  return db.giveawayRequest.findUnique({
    where: {
      giveawayId_requesterId: {
        giveawayId: params.giveawayId,
        requesterId: params.requesterId,
      },
    },
    select: requestSelect,
  });
}

async function findRequestsWithCount(
  { skip, take, where }: ListRequestParams,
  db: DbClient = prisma,
) {
  const [requests, totalCount] = await Promise.all([
    db.giveawayRequest.findMany({
      where,
      select: requestSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    db.giveawayRequest.count({ where }),
  ]);

  return { requests, totalCount };
}

async function findMyRequestsWithCount(
  { skip, take, where }: ListRequestParams,
  db: DbClient = prisma,
) {
  const [requests, totalCount] = await Promise.all([
    db.giveawayRequest.findMany({
      where,
      select: myRequestSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    db.giveawayRequest.count({ where }),
  ]);

  return { requests, totalCount };
}

function createRequest(
  params: {
    giveawayId: number;
    requesterId: string;
    message?: string;
  },
  db: DbClient = prisma,
) {
  const data: Prisma.GiveawayRequestUncheckedCreateInput = {
    giveawayId: params.giveawayId,
    requesterId: params.requesterId,
    status: GIVEAWAY_REQUEST_STATUS.PENDING,
  };

  if (params.message !== undefined) {
    data.message = params.message;
  }

  return db.giveawayRequest.create({
    data,
    select: requestSelect,
  });
}

async function updateRequestMessage(
  params: { requestId: number; requesterId: string; message: string | null },
  db: DbClient = prisma,
) {
  const { count } = await db.giveawayRequest.updateMany({
    where: {
      id: params.requestId,
      requesterId: params.requesterId,
      status: GIVEAWAY_REQUEST_STATUS.PENDING,
    },
    data: { message: params.message },
  });

  return count > 0;
}

async function updateRequestStatus(
  params: {
    requestId: number;
    fromStatus: GiveawayRequestStatusValue | GiveawayRequestStatusValue[];
    toStatus: GiveawayRequestStatusValue;
    giveawayId?: number;
    requesterId?: string;
  },
  db: DbClient = prisma,
) {
  const fromStatus = Array.isArray(params.fromStatus)
    ? { in: params.fromStatus }
    : params.fromStatus;

  const where: Prisma.GiveawayRequestWhereInput = {
    id: params.requestId,
    status: fromStatus,
  };

  if (params.giveawayId !== undefined) {
    where.giveawayId = params.giveawayId;
  }

  if (params.requesterId !== undefined) {
    where.requesterId = params.requesterId;
  }

  const { count } = await db.giveawayRequest.updateMany({
    where,
    data: { status: params.toStatus },
  });

  return count > 0;
}

export const giveawayRepository = {
  findGiveawayById,
  findGiveawayOwnership,
  findRegionById,
  findGiveawaysWithCount,
  createGiveaway,
  updateGiveaway,
  deleteGiveaway,
  markGiveawayInProgress,
  completeGiveaway,
  restoreGiveawayToAvailable,
  findRequestById,
  findRequestByGiveawayAndRequester,
  findRequestsWithCount,
  findMyRequestsWithCount,
  createRequest,
  updateRequestMessage,
  updateRequestStatus,
};
