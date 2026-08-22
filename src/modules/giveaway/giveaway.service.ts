import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import type { CursorPagination } from "../../types/response.type";
import { lockGiveawayForUpdate } from "../../utils/giveaway-lock.util";
import { escapeLikePattern } from "../../utils/search.util";
import { runTransaction } from "../../utils/transaction";
import type { DbClient } from "../../utils/transaction";
import { cleanupGiveawayImagesSafely } from "./giveaway-image.cleanup";
import { giveawayImageService } from "./giveaway-image.service";
import {
  decodeGiveawayCursor,
  decodeGiveawayRequestCursor,
  encodeGiveawayNextCursor,
  encodeGiveawayRequestNextCursor,
  sliceGiveawayCursorPage,
  toGiveawayCursorQuery,
  toGiveawayRequestCursorQuery,
} from "./giveaway.cursor";
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
  ListMyGiveawayRequestQuery,
  UpdateGiveawayInput,
  UpdateGiveawayRequestInput,
} from "./giveaway.type";

function toImageRecords(imageKeys: string[]) {
  return imageKeys.map((imageKey, index) => ({
    imageKey,
    sortOrder: index,
  }));
}

export function toRemovedGiveawayImageKeys(latestKeys: string[], nextKeys: string[]): string[] {
  const nextKeySet = new Set(nextKeys);

  return latestKeys.filter((key) => !nextKeySet.has(key));
}

function assertReusableGiveawayImageKeys(
  nextKeys: string[],
  latestKeySet: Set<string>,
  currentKeySet: Set<string>,
  newlyCopied: Set<string>,
) {
  for (const key of nextKeys) {
    if (newlyCopied.has(key) || latestKeySet.has(key)) {
      continue;
    }

    if (currentKeySet.has(key)) {
      throw new AppError("GIVEAWAY_UPDATE_CONFLICT");
    }

    throw new AppError("BAD_REQUEST", {
      message: "다른 나눔 글의 이미지는 재사용할 수 없습니다.",
    });
  }
}

function toTitleContainsFilter(keyword: string | undefined): Prisma.StringFilter | undefined {
  if (keyword === undefined) {
    return undefined;
  }

  return {
    contains: escapeLikePattern(keyword),
    mode: "insensitive",
  };
}

function toGiveawayUpdateData(
  input: UpdateGiveawayInput,
  images?: Array<{ imageKey: string; sortOrder: number }>,
) {
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

  if (images !== undefined) {
    updateData.images = images;
  }

  return updateData;
}

async function cleanupTemporaryImages(userId: string, keys: string[]) {
  await cleanupGiveawayImagesSafely(
    keys,
    (key) => giveawayImageService.deleteTemporaryImage(userId, key),
    {
      userId,
      action: "DELETE_TEMP_IMAGE",
    },
  );
}

async function cleanupPreviousImages(userId: string, keys: string[]) {
  await cleanupGiveawayImagesSafely(
    keys,
    (key) => giveawayImageService.deleteFinalImage(userId, key),
    {
      userId,
      action: "DELETE_PREVIOUS_IMAGE",
    },
  );
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
    "giveaway_requests_one_active_per_user_idx",
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

async function assertRegionExists(regionId: number | null | undefined, db?: DbClient) {
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

async function listVisibleGiveaways(
  query: ListMyGiveawayQuery & Pick<ListGiveawayQuery, "keyword" | "regionId">,
  extraWhere: Prisma.GiveawayWhereInput = {},
) {
  await assertRegionExists(query.regionId);

  const where: Prisma.GiveawayWhereInput = {
    ...extraWhere,
    isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
  };

  if (query.status !== undefined) {
    where.status = query.status;
  }

  if (query.regionId !== undefined) {
    where.regionId = query.regionId;
  }

  const title = toTitleContainsFilter(query.keyword);

  if (title !== undefined) {
    where.title = title;
  }

  const cursorQuery = toGiveawayCursorQuery({
    sort: query.sort,
    status: query.status,
    regionId: query.regionId,
    keyword: query.keyword,
  });
  const decodedCursor = decodeGiveawayCursor(query.cursor, cursorQuery);
  const { giveaways, totalCount } = await giveawayRepository.findGiveawaysByCursorWithCount({
    take: query.limit + 1,
    where,
    orderBy: giveawayRepository.toCreatedAtOrderBy(query.sort),
    ...(decodedCursor ? { cursor: decodedCursor } : {}),
  });
  const { pageItems, hasNext } = sliceGiveawayCursorPage(giveaways, query.limit);

  return {
    giveaways: pageItems.map(toGiveawayListItem),
    pagination: {
      limit: query.limit,
      totalCount,
      hasNext,
      nextCursor: encodeGiveawayNextCursor(pageItems.at(-1), hasNext, cursorQuery),
    } satisfies CursorPagination,
  };
}

async function listGiveaways(query: ListGiveawayQuery) {
  return listVisibleGiveaways(query);
}

async function listMyGiveaways(authorId: string, query: ListMyGiveawayQuery) {
  return listVisibleGiveaways(query, { authorId });
}

async function listReceivedGiveaways(receiverId: string, query: ListMyGiveawayQuery) {
  return listVisibleGiveaways(query, { receiverId });
}

async function createGiveaway(authorId: string, input: CreateGiveawayInput) {
  await assertRegionExists(input.regionId);

  const tempKeys = input.imageKeys;
  const finalizedKeys = await giveawayImageService.finalizeUploadedImages(authorId, tempKeys);

  let giveaway;

  try {
    giveaway = await runTransaction(async (tx) => {
      await assertRegionExists(input.regionId, tx);

      const createData: Parameters<typeof giveawayRepository.createGiveaway>[0] = {
        authorId,
        title: input.title,
        description: input.description,
        images: toImageRecords(finalizedKeys),
      };

      if (input.regionId !== undefined) {
        createData.regionId = input.regionId;
      }

      return giveawayRepository.createGiveaway(createData, tx);
    });
  } catch (error) {
    await giveawayImageService.rollbackFinalizedImages(authorId, finalizedKeys);
    throw error;
  }

  await cleanupTemporaryImages(authorId, tempKeys);

  return toGiveawayDetail(giveaway, { id: authorId }, null);
}

async function updateGiveaway(giveawayId: number, authorId: string, input: UpdateGiveawayInput) {
  if (input.imageKeys === undefined) {
    return runTransaction(async (tx) => {
      const owned = await findGiveawayOwnershipOrThrow(giveawayId, tx);

      assertGiveawayAuthor(owned, authorId);
      assertGiveawayEditable(owned);
      await assertRegionExists(input.regionId, tx);

      const giveaway = await giveawayRepository.updateGiveaway(
        giveawayId,
        toGiveawayUpdateData(input),
        tx,
      );

      return toGiveawayDetail(giveaway, { id: authorId }, null);
    });
  }

  const current = await findVisibleGiveawayOrThrow(giveawayId);

  assertGiveawayAuthor(current, authorId);
  assertGiveawayEditable(current);
  await assertRegionExists(input.regionId);

  const currentKeys = current.images.map((image) => image.imageKey);
  const prepared = await giveawayImageService.prepareUpdatedImages(
    authorId,
    input.imageKeys,
    currentKeys,
  );
  const newlyCopied = new Set(prepared.finalizedKeys);

  let giveaway;
  let removedKeys: string[];

  try {
    ({ giveaway, removedKeys } = await runTransaction(async (tx) => {
      // 동일 글 이미지 수정을 직렬화한 뒤, update 직전 latestKeys로 cleanup 대상을 계산한다.
      const locked = await lockGiveawayForUpdate(tx, giveawayId);

      if (!locked) {
        throw new AppError("GIVEAWAY_NOT_FOUND");
      }

      const latest = await findVisibleGiveawayOrThrow(giveawayId, tx);

      assertGiveawayAuthor(latest, authorId);
      assertGiveawayEditable(latest);
      await assertRegionExists(input.regionId, tx);

      const latestKeys = latest.images.map((image) => image.imageKey);

      assertReusableGiveawayImageKeys(
        prepared.nextKeys,
        new Set(latestKeys),
        new Set(currentKeys),
        newlyCopied,
      );

      const updated = await giveawayRepository.updateGiveaway(
        giveawayId,
        toGiveawayUpdateData(input, toImageRecords(prepared.nextKeys)),
        tx,
      );

      return {
        giveaway: updated,
        removedKeys: toRemovedGiveawayImageKeys(latestKeys, prepared.nextKeys),
      };
    }));
  } catch (error) {
    await giveawayImageService.rollbackFinalizedImages(authorId, prepared.finalizedKeys);
    throw error;
  }

  await cleanupTemporaryImages(authorId, prepared.tempKeys);
  await cleanupPreviousImages(authorId, removedKeys);

  return toGiveawayDetail(giveaway, { id: authorId }, null);
}

async function deleteGiveaway(giveawayId: number, authorId: string) {
  const imageKeys = await runTransaction(async (tx) => {
    const locked = await lockGiveawayForUpdate(tx, giveawayId);

    if (!locked) {
      throw new AppError("GIVEAWAY_NOT_FOUND");
    }

    const giveaway = await findVisibleGiveawayOrThrow(giveawayId, tx);

    assertGiveawayAuthor(giveaway, authorId);
    assertGiveawayDeletable(giveaway);

    const keys = giveaway.images.map((image) => image.imageKey);

    await giveawayRepository.deleteGiveaway(giveawayId, tx);

    return keys;
  });

  await cleanupPreviousImages(authorId, imageKeys);
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

  const cursorQuery = toGiveawayRequestCursorQuery({
    sort: query.sort,
    status: query.status,
  });
  const decodedCursor = decodeGiveawayRequestCursor(query.cursor, cursorQuery);
  const { requests, totalCount } = await giveawayRepository.findRequestsByCursorWithCount({
    take: query.limit + 1,
    where,
    orderBy: giveawayRepository.toCreatedAtOrderBy(query.sort),
    ...(decodedCursor ? { cursor: decodedCursor } : {}),
  });
  const { pageItems, hasNext } = sliceGiveawayCursorPage(requests, query.limit);

  return {
    requests: pageItems.map(toGiveawayRequestItem),
    pagination: {
      limit: query.limit,
      totalCount,
      hasNext,
      nextCursor: encodeGiveawayRequestNextCursor(pageItems.at(-1), hasNext, cursorQuery),
    } satisfies CursorPagination,
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

      const activeRequest = await giveawayRepository.findActiveRequestByGiveawayAndRequester(
        { giveawayId, requesterId },
        tx,
      );

      if (activeRequest) {
        throw new AppError("GIVEAWAY_REQUEST_ALREADY_EXISTS");
      }

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
    requesterId,
    message: input.message,
  });

  if (!updated) {
    throw new AppError("GIVEAWAY_REQUEST_NOT_EDITABLE");
  }

  const saved = await giveawayRepository.findRequestById(requestId);

  if (!saved) {
    throw new AppError("GIVEAWAY_REQUEST_NOT_FOUND");
  }

  return toGiveawayRequestItem(saved);
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

async function listMyGiveawayRequests(requesterId: string, query: ListMyGiveawayRequestQuery) {
  const giveawayWhere: Prisma.GiveawayWhereInput = {
    isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
  };
  const title = toTitleContainsFilter(query.keyword);

  if (title !== undefined) {
    giveawayWhere.title = title;
  }

  const where: Prisma.GiveawayRequestWhereInput = {
    requesterId,
    giveaway: giveawayWhere,
  };

  if (query.status !== undefined) {
    where.status = query.status;
  }

  const cursorQuery = toGiveawayRequestCursorQuery({
    sort: query.sort,
    status: query.status,
    keyword: query.keyword,
  });
  const decodedCursor = decodeGiveawayRequestCursor(query.cursor, cursorQuery);
  const { requests, totalCount } = await giveawayRepository.findMyRequestsByCursorWithCount({
    take: query.limit + 1,
    where,
    orderBy: giveawayRepository.toCreatedAtOrderBy(query.sort),
    ...(decodedCursor ? { cursor: decodedCursor } : {}),
  });
  const { pageItems, hasNext } = sliceGiveawayCursorPage(requests, query.limit);

  return {
    requests: pageItems.map(toMyGiveawayRequestItem),
    pagination: {
      limit: query.limit,
      totalCount,
      hasNext,
      nextCursor: encodeGiveawayRequestNextCursor(pageItems.at(-1), hasNext, cursorQuery),
    } satisfies CursorPagination,
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
