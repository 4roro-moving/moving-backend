import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";
import {
  ACTIVE_GIVEAWAY_REQUEST_STATUSES,
  GIVEAWAY_LIST_SORT,
  GIVEAWAY_REQUEST_STATUS,
  GIVEAWAY_STATUS,
  GIVEAWAY_VISIBILITY,
} from "./giveaway.type";
import type {
  GiveawayCursor,
  GiveawayListSortValue,
  GiveawayRequestCursor,
  GiveawayRequestStatusValue,
} from "./giveaway.type";

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
            in: [...ACTIVE_GIVEAWAY_REQUEST_STATUSES],
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
            in: [...ACTIVE_GIVEAWAY_REQUEST_STATUSES],
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

type ListGiveawayByCursorParams = {
  take: number;
  where: Prisma.GiveawayWhereInput;
  orderBy: Prisma.GiveawayOrderByWithRelationInput[];
  cursor?: Pick<GiveawayCursor, "sort" | "createdAt" | "id">;
};

type ListRequestByCursorParams = {
  take: number;
  where: Prisma.GiveawayRequestWhereInput;
  orderBy: Prisma.GiveawayRequestOrderByWithRelationInput[];
  cursor?: Pick<GiveawayRequestCursor, "sort" | "createdAt" | "id">;
};

function toCreatedAtOrderBy(sort: GiveawayListSortValue) {
  if (sort === GIVEAWAY_LIST_SORT.OLDEST) {
    return [{ createdAt: "asc" as const }, { id: "asc" as const }];
  }

  return [{ createdAt: "desc" as const }, { id: "desc" as const }];
}

export function buildCursorCondition(cursor: Pick<GiveawayCursor, "sort" | "createdAt" | "id">): {
  OR: Array<
    | { createdAt: { lt: Date } | { gt: Date } }
    | { createdAt: Date; id: { lt: number } | { gt: number } }
  >;
} {
  if (cursor.sort === GIVEAWAY_LIST_SORT.OLDEST) {
    return {
      OR: [
        { createdAt: { gt: cursor.createdAt } },
        {
          createdAt: cursor.createdAt,
          id: { gt: cursor.id },
        },
      ],
    };
  }

  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      {
        createdAt: cursor.createdAt,
        id: { lt: cursor.id },
      },
    ],
  };
}

function applyGiveawayCursor(
  where: Prisma.GiveawayWhereInput,
  cursor?: Pick<GiveawayCursor, "sort" | "createdAt" | "id">,
): Prisma.GiveawayWhereInput {
  if (!cursor) {
    return where;
  }

  return {
    AND: [where, buildCursorCondition(cursor)],
  };
}

function applyRequestCursor(
  where: Prisma.GiveawayRequestWhereInput,
  cursor?: Pick<GiveawayRequestCursor, "sort" | "createdAt" | "id">,
): Prisma.GiveawayRequestWhereInput {
  if (!cursor) {
    return where;
  }

  return {
    AND: [where, buildCursorCondition(cursor)],
  };
}

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

async function findGiveawayById(giveawayId: number, db: DbClient = prisma) {
  return db.giveaway.findUnique({
    where: { id: giveawayId },
    select: giveawayDetailSelect,
  });
}

async function findGiveawayOwnership(giveawayId: number, db: DbClient = prisma) {
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

async function findGiveawaysByCursorWithCount(
  { take, where, orderBy, cursor }: ListGiveawayByCursorParams,
  db: DbClient = prisma,
) {
  const [giveaways, totalCount] = await Promise.all([
    db.giveaway.findMany({
      where: applyGiveawayCursor(where, cursor),
      select: giveawayListSelect,
      orderBy,
      take,
    }),
    // 무한 스크롤 다음 페이지에서는 같은 필터의 전체 건수를 다시 세지 않습니다.
    cursor == null ? db.giveaway.count({ where }) : Promise.resolve(null),
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

function findActiveRequestByGiveawayAndRequester(
  params: { giveawayId: number; requesterId: string },
  db: DbClient = prisma,
) {
  return db.giveawayRequest.findFirst({
    where: {
      giveawayId: params.giveawayId,
      requesterId: params.requesterId,
      status: {
        in: [...ACTIVE_GIVEAWAY_REQUEST_STATUSES],
      },
    },
    select: requestSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

async function findRequestByGiveawayAndRequester(
  params: { giveawayId: number; requesterId: string },
  db: DbClient = prisma,
) {
  const activeRequest = await findActiveRequestByGiveawayAndRequester(params, db);

  if (activeRequest) {
    return activeRequest;
  }

  return db.giveawayRequest.findFirst({
    where: {
      giveawayId: params.giveawayId,
      requesterId: params.requesterId,
    },
    select: requestSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

async function findRequestsByCursorWithCount(
  { take, where, orderBy, cursor }: ListRequestByCursorParams,
  db: DbClient = prisma,
) {
  const [requests, totalCount] = await Promise.all([
    db.giveawayRequest.findMany({
      where: applyRequestCursor(where, cursor),
      select: requestSelect,
      orderBy,
      take,
    }),
    cursor == null ? db.giveawayRequest.count({ where }) : Promise.resolve(null),
  ]);

  return { requests, totalCount };
}

async function findMyRequestsByCursorWithCount(
  { take, where, orderBy, cursor }: ListRequestByCursorParams,
  db: DbClient = prisma,
) {
  const [requests, totalCount] = await Promise.all([
    db.giveawayRequest.findMany({
      where: applyRequestCursor(where, cursor),
      select: myRequestSelect,
      orderBy,
      take,
    }),
    cursor == null ? db.giveawayRequest.count({ where }) : Promise.resolve(null),
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
  findGiveawaysByCursorWithCount,
  toCreatedAtOrderBy,
  buildCursorCondition,
  createGiveaway,
  updateGiveaway,
  deleteGiveaway,
  markGiveawayInProgress,
  completeGiveaway,
  restoreGiveawayToAvailable,
  findRequestById,
  findActiveRequestByGiveawayAndRequester,
  findRequestByGiveawayAndRequester,
  findRequestsByCursorWithCount,
  findMyRequestsByCursorWithCount,
  createRequest,
  updateRequestMessage,
  updateRequestStatus,
};
