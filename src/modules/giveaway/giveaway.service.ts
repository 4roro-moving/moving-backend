import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";
import { runTransaction } from "../../utils/transaction";
import type { DbClient } from "../../utils/transaction";
import { giveawayImageService } from "./giveaway-image.service";
import {
  toGiveawayDetail,
  toGiveawayListItem,
  toGiveawayRequestItem,
  toMyGiveawayRequestItem,
} from "./giveaway.mapper";
import {
  assertCanRequestGiveaway,
  assertGiveawayAuthor,
  assertGiveawayCompletable,
  assertGiveawayDeletable,
  assertGiveawayEditable,
  assertGiveawayVisible,
  assertRequestCancellable,
  assertRequestMessageEditable,
  assertRequestOwner,
  assertRequestRejectable,
  assertRequestSelectable,
} from "./giveaway.policy";
import { giveawayRepository } from "./giveaway.repository";
import type { GiveawayOwnershipRow } from "./giveaway.repository";
import { GIVEAWAY_REQUEST_STATUS, GIVEAWAY_VISIBILITY } from "./giveaway.type";
import type {
  CreateGiveawayInput,
  CreateGiveawayRequestInput,
  ListGiveawayQuery,
  ListGiveawayRequestQuery,
  ListMyGiveawayQuery,
  UpdateGiveawayInput,
  UpdateGiveawayRequestInput,
} from "./giveaway.type";

function toImageRecords(imageKeys: string[]) {
  return imageKeys.map((imageKey, index) => ({
    imageKey,
    sortOrder: index,
  }));
}

function isUniqueConstraintError(error: unknown, fields: string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  const normalizedFields = fields.map((field) => field.toLowerCase());

  if (Array.isArray(target)) {
    return target.some((field) => normalizedFields.includes(String(field).toLowerCase()));
  }

  if (typeof target !== "string") {
    return false;
  }

  const normalizedTarget = target.toLowerCase();

  return normalizedFields.some((field) => normalizedTarget.includes(field));
}

function isDuplicateRequestError(error: unknown): boolean {
  return isUniqueConstraintError(error, [
    "giveaway_id",
    "giveawayid",
    "requester_id",
    "requesterid",
  ]);
}

function isDuplicateSelectedError(error: unknown): boolean {
  return isUniqueConstraintError(error, [
    "giveaway_requests_one_selected_per_giveaway_idx",
    "giveaway_id",
    "giveawayid",
  ]);
}

async function assertRegionExists(regionId: number | null | undefined, db: DbClient) {
  if (regionId === undefined || regionId === null) {
    return;
  }

  const region = await giveawayRepository.findRegionById(regionId, db);

  if (!region) {
    throw new AppError("REGION_NOT_FOUND");
  }
}

async function findGiveawayOwnershipOrThrow(
  giveawayId: number,
  db?: DbClient,
): Promise<GiveawayOwnershipRow> {
  const giveaway = await giveawayRepository.findGiveawayOwnership(giveawayId, db);

  assertGiveawayVisible(giveaway);

  return giveaway;
}

async function findVisibleGiveawayOrThrow(giveawayId: number, db?: DbClient) {
  const giveaway = await giveawayRepository.findGiveawayById(giveawayId, db);

  assertGiveawayVisible(giveaway);

  return giveaway;
}

async function getGiveawayDetail(giveawayId: number, viewerId: string) {
  const giveaway = await findVisibleGiveawayOrThrow(giveawayId);
  const myRequest = await giveawayRepository.findRequestByGiveawayAndRequester({
    giveawayId,
    requesterId: viewerId,
  });

  return toGiveawayDetail(giveaway, { id: viewerId }, myRequest);
}

async function listGiveaways(query: ListGiveawayQuery) {
  await assertRegionExists(query.regionId);

  const where: Prisma.GiveawayWhereInput = {
    isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
  };

  if (query.status !== undefined) {
    where.status = query.status;
  }

  if (query.regionId !== undefined) {
    where.regionId = query.regionId;
  }

  const { giveaways, totalCount } = await giveawayRepository.findGiveawaysWithCount({
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    where,
  });

  return {
    giveaways: giveaways.map(toGiveawayListItem),
    pagination: buildPagination(totalCount, query.page, query.limit),
  };
}

async function listMyGiveaways(authorId: string, query: ListMyGiveawayQuery) {
  await assertRegionExists(query.regionId);

  const where: Prisma.GiveawayWhereInput = {
    authorId,
    isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
  };

  if (query.status !== undefined) {
    where.status = query.status;
  }

  if (query.regionId !== undefined) {
    where.regionId = query.regionId;
  }

  const { giveaways, totalCount } = await giveawayRepository.findGiveawaysWithCount({
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    where,
  });

  return {
    giveaways: giveaways.map(toGiveawayListItem),
    pagination: buildPagination(totalCount, query.page, query.limit),
  };
}

async function listReceivedGiveaways(receiverId: string, query: ListMyGiveawayQuery) {
  await assertRegionExists(query.regionId);

  const where: Prisma.GiveawayWhereInput = {
    receiverId,
    isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
  };

  if (query.status !== undefined) {
    where.status = query.status;
  }

  if (query.regionId !== undefined) {
    where.regionId = query.regionId;
  }

  const { giveaways, totalCount } = await giveawayRepository.findGiveawaysWithCount({
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    where,
  });

  return {
    giveaways: giveaways.map(toGiveawayListItem),
    pagination: buildPagination(totalCount, query.page, query.limit),
  };
}

async function createGiveaway(authorId: string, input: CreateGiveawayInput) {
  await giveawayImageService.validateUploadedImages(authorId, input.imageKeys);

  return runTransaction(async (tx) => {
    await assertRegionExists(input.regionId, tx);

    const createData: Parameters<typeof giveawayRepository.createGiveaway>[0] = {
      authorId,
      title: input.title,
      description: input.description,
      images: toImageRecords(input.imageKeys),
    };

    if (input.regionId !== undefined) {
      createData.regionId = input.regionId;
    }

    const giveaway = await giveawayRepository.createGiveaway(createData, tx);

    return toGiveawayDetail(giveaway, { id: authorId }, null);
  });
}

async function updateGiveaway(giveawayId: number, authorId: string, input: UpdateGiveawayInput) {
  if (input.imageKeys !== undefined) {
    await giveawayImageService.validateUploadedImages(authorId, input.imageKeys);
  }

  return runTransaction(async (tx) => {
    const owned = await findGiveawayOwnershipOrThrow(giveawayId, tx);

    assertGiveawayAuthor(owned, authorId);
    assertGiveawayEditable(owned);
    await assertRegionExists(input.regionId, tx);

    const updateData: Parameters<typeof giveawayRepository.updateGiveaway>[1] = {};

    if (input.title !== undefined) {
      updateData.title = input.title;
    }

    if (input.description !== undefined) {
      updateData.description = input.description;
    }

    if (input.regionId !== undefined) {
      updateData.regionId = input.regionId;
    }

    if (input.imageKeys !== undefined) {
      updateData.images = toImageRecords(input.imageKeys);
    }

    const giveaway = await giveawayRepository.updateGiveaway(giveawayId, updateData, tx);

    return toGiveawayDetail(giveaway, { id: authorId }, null);
  });
}

async function deleteGiveaway(giveawayId: number, authorId: string) {
  await runTransaction(async (tx) => {
    const owned = await findGiveawayOwnershipOrThrow(giveawayId, tx);

    assertGiveawayAuthor(owned, authorId);
    assertGiveawayDeletable(owned);

    await giveawayRepository.deleteGiveaway(giveawayId, tx);
  });
}

async function completeGiveaway(giveawayId: number, authorId: string) {
  return runTransaction(async (tx) => {
    const owned = await findGiveawayOwnershipOrThrow(giveawayId, tx);

    assertGiveawayAuthor(owned, authorId);
    assertGiveawayCompletable(owned);

    const completed = await giveawayRepository.completeGiveaway({ giveawayId, authorId }, tx);

    if (!completed) {
      throw new AppError("GIVEAWAY_NOT_COMPLETABLE");
    }

    const giveaway = await giveawayRepository.findGiveawayById(giveawayId, tx);

    if (!giveaway) {
      throw new AppError("GIVEAWAY_NOT_FOUND");
    }

    return toGiveawayDetail(giveaway, { id: authorId }, null);
  });
}

async function listGiveawayRequests(
  giveawayId: number,
  authorId: string,
  query: ListGiveawayRequestQuery,
) {
  const owned = await findGiveawayOwnershipOrThrow(giveawayId);

  assertGiveawayAuthor(owned, authorId);

  const where: Prisma.GiveawayRequestWhereInput = { giveawayId };

  if (query.status !== undefined) {
    where.status = query.status;
  }

  const { requests, totalCount } = await giveawayRepository.findRequestsWithCount({
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    where,
  });

  return {
    requests: requests.map(toGiveawayRequestItem),
    pagination: buildPagination(totalCount, query.page, query.limit),
  };
}

async function createGiveawayRequest(
  giveawayId: number,
  requesterId: string,
  input: CreateGiveawayRequestInput,
) {
  try {
    return await runTransaction(async (tx) => {
      const giveaway = await findGiveawayOwnershipOrThrow(giveawayId, tx);

      assertCanRequestGiveaway(giveaway, requesterId);

      const createData: Parameters<typeof giveawayRepository.createRequest>[0] = {
        giveawayId,
        requesterId,
      };

      if (input.message !== undefined) {
        createData.message = input.message;
      }

      const request = await giveawayRepository.createRequest(createData, tx);

      return toGiveawayRequestItem(request);
    });
  } catch (error) {
    if (isDuplicateRequestError(error)) {
      throw new AppError("GIVEAWAY_REQUEST_ALREADY_EXISTS");
    }

    throw error;
  }
}

async function updateGiveawayRequest(
  requestId: number,
  requesterId: string,
  input: UpdateGiveawayRequestInput,
) {
  const request = await giveawayRepository.findRequestById(requestId);

  if (!request) {
    throw new AppError("GIVEAWAY_REQUEST_NOT_FOUND");
  }

  const giveaway = await findGiveawayOwnershipOrThrow(request.giveawayId);

  assertRequestOwner(request, requesterId);
  assertRequestMessageEditable(request, giveaway);

  const updated = await giveawayRepository.updateRequestMessage({
    requestId,
    message: input.message,
  });

  return toGiveawayRequestItem(updated);
}

async function cancelGiveawayRequest(requestId: number, requesterId: string) {
  return runTransaction(
    async (tx) => {
      const request = await giveawayRepository.findRequestById(requestId, tx);

      if (!request) {
        throw new AppError("GIVEAWAY_REQUEST_NOT_FOUND");
      }

      const giveaway = await findGiveawayOwnershipOrThrow(request.giveawayId, tx);

      assertRequestOwner(request, requesterId);
      assertRequestCancellable(request, giveaway);

      if (request.status === GIVEAWAY_REQUEST_STATUS.PENDING) {
        const cancelled = await giveawayRepository.updateRequestStatus(
          {
            requestId,
            requesterId,
            fromStatus: GIVEAWAY_REQUEST_STATUS.PENDING,
            toStatus: GIVEAWAY_REQUEST_STATUS.CANCELLED,
          },
          tx,
        );

        if (!cancelled) {
          throw new AppError("GIVEAWAY_REQUEST_CANCEL_NOT_ALLOWED");
        }

        const updated = await giveawayRepository.findRequestById(requestId, tx);

        if (!updated) {
          throw new AppError("GIVEAWAY_REQUEST_NOT_FOUND");
        }

        return toGiveawayRequestItem(updated);
      }

      const cancelled = await giveawayRepository.updateRequestStatus(
        {
          requestId,
          requesterId,
          fromStatus: GIVEAWAY_REQUEST_STATUS.SELECTED,
          toStatus: GIVEAWAY_REQUEST_STATUS.CANCELLED,
        },
        tx,
      );

      if (!cancelled) {
        throw new AppError("GIVEAWAY_REQUEST_CANCEL_NOT_ALLOWED");
      }

      const restored = await giveawayRepository.restoreGiveawayToAvailable(
        {
          giveawayId: request.giveawayId,
          receiverId: requesterId,
        },
        tx,
      );

      if (!restored) {
        throw new AppError("GIVEAWAY_REQUEST_CANCEL_NOT_ALLOWED");
      }

      const updated = await giveawayRepository.findRequestById(requestId, tx);

      if (!updated) {
        throw new AppError("GIVEAWAY_REQUEST_NOT_FOUND");
      }

      return toGiveawayRequestItem(updated);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

async function selectGiveawayRequest(giveawayId: number, requestId: number, authorId: string) {
  try {
    return await runTransaction(
      async (tx) => {
        const giveaway = await findGiveawayOwnershipOrThrow(giveawayId, tx);

        assertGiveawayAuthor(giveaway, authorId);

        const request = await giveawayRepository.findRequestById(requestId, tx);

        if (!request) {
          throw new AppError("GIVEAWAY_REQUEST_NOT_FOUND");
        }

        assertRequestSelectable(giveaway, request);

        const selected = await giveawayRepository.updateRequestStatus(
          {
            requestId,
            giveawayId,
            fromStatus: GIVEAWAY_REQUEST_STATUS.PENDING,
            toStatus: GIVEAWAY_REQUEST_STATUS.SELECTED,
          },
          tx,
        );

        if (!selected) {
          throw new AppError("GIVEAWAY_REQUEST_NOT_SELECTABLE");
        }

        const progressed = await giveawayRepository.markGiveawayInProgress(
          {
            giveawayId,
            authorId,
            receiverId: request.requesterId,
          },
          tx,
        );

        if (!progressed) {
          throw new AppError("GIVEAWAY_RECEIVER_ALREADY_SELECTED");
        }

        const updatedGiveaway = await giveawayRepository.findGiveawayById(giveawayId, tx);

        if (!updatedGiveaway) {
          throw new AppError("GIVEAWAY_NOT_FOUND");
        }

        return toGiveawayDetail(updatedGiveaway, { id: authorId }, null);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    if (isDuplicateSelectedError(error)) {
      throw new AppError("GIVEAWAY_RECEIVER_ALREADY_SELECTED");
    }

    throw error;
  }
}

async function rejectGiveawayRequest(giveawayId: number, requestId: number, authorId: string) {
  return runTransaction(async (tx) => {
    const giveaway = await findGiveawayOwnershipOrThrow(giveawayId, tx);

    assertGiveawayAuthor(giveaway, authorId);

    const request = await giveawayRepository.findRequestById(requestId, tx);

    if (!request) {
      throw new AppError("GIVEAWAY_REQUEST_NOT_FOUND");
    }

    assertRequestRejectable(giveaway, request);

    const rejected = await giveawayRepository.updateRequestStatus(
      {
        requestId,
        giveawayId,
        fromStatus: GIVEAWAY_REQUEST_STATUS.PENDING,
        toStatus: GIVEAWAY_REQUEST_STATUS.REJECTED,
      },
      tx,
    );

    if (!rejected) {
      throw new AppError("GIVEAWAY_REQUEST_NOT_REJECTABLE");
    }

    const updated = await giveawayRepository.findRequestById(requestId, tx);

    if (!updated) {
      throw new AppError("GIVEAWAY_REQUEST_NOT_FOUND");
    }

    return toGiveawayRequestItem(updated);
  });
}

async function listMyGiveawayRequests(requesterId: string, query: ListGiveawayRequestQuery) {
  const where: Prisma.GiveawayRequestWhereInput = {
    requesterId,
    giveaway: {
      isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
    },
  };

  if (query.status !== undefined) {
    where.status = query.status;
  }

  const { requests, totalCount } = await giveawayRepository.findMyRequestsWithCount({
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    where,
  });

  return {
    requests: requests.map(toMyGiveawayRequestItem),
    pagination: buildPagination(totalCount, query.page, query.limit),
  };
}

export const giveawayService = {
  listGiveaways,
  listMyGiveaways,
  listReceivedGiveaways,
  getGiveawayDetail,
  createGiveaway,
  updateGiveaway,
  deleteGiveaway,
  completeGiveaway,
  listGiveawayRequests,
  createGiveawayRequest,
  updateGiveawayRequest,
  cancelGiveawayRequest,
  selectGiveawayRequest,
  rejectGiveawayRequest,
  listMyGiveawayRequests,
};
