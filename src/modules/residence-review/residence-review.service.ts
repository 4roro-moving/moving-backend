import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import type { CursorPagination } from "../../types/response.type";
import { getProfileImageUrl } from "../../utils/image-url";
import { buildPagination } from "../../utils/pagination.util";
import { runTransaction } from "../../utils/transaction";
import type { DbClient } from "../../utils/transaction";
import {
  decodeResidenceReviewCursor,
  encodeResidenceReviewNextCursor,
  sliceResidenceReviewCursorPage,
  toResidenceReviewCursorQuery,
} from "./residence-review.cursor";
import { residenceReviewRepository } from "./residence-review.repository";
import type { ResidenceReviewRow } from "./residence-review.repository";
import { REGION_REVIEW_STATISTIC, RESIDENCE_REVIEW_VISIBILITY } from "./residence-review.type";
import type {
  CreateResidenceReviewInput,
  ListMyResidenceReviewQuery,
  ListResidenceReviewQuery,
  MyResidenceReview,
  PublicResidenceReview,
  RegionReviewStatistic,
  UpdateResidenceReviewInput,
} from "./residence-review.type";

function toResidenceReviewItem(row: ResidenceReviewRow, averageRating?: number): MyResidenceReview {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    rating: row.rating,
    region: {
      id: row.region.id,
      name: row.region.name,
      averageRating: averageRating ?? Number(row.region.reviewStatistic?.averageRating ?? 0),
    },
    author: {
      id: row.author.id,
      name: row.author.name,
      imageUrl: getProfileImageUrl(row.author.customerProfile?.imageUrl ?? null),
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPublicResidenceReview(
  row: ResidenceReviewRow,
  viewerId?: string,
  averageRating?: number,
): PublicResidenceReview {
  return {
    ...toResidenceReviewItem(row, averageRating),
    isMine: viewerId !== undefined && viewerId === row.author.id,
  };
}

function roundAverageRating(ratingSum: number, reviewCount: number): number {
  if (reviewCount === 0) {
    return 0;
  }

  const factor = 10 ** REGION_REVIEW_STATISTIC.AVERAGE_DECIMAL_PLACES;

  return Math.round((ratingSum / reviewCount) * factor) / factor;
}

/**
 * 노출 중인(`isHidden=false`) 후기만 집계해 RegionReviewStatistic 을 갱신합니다.
 * 관리자 숨김/해제에서 ResidenceReview.isHidden 을 바꿀 때도
 * 같은 트랜잭션 안에서 반드시 호출해야 통계와 공개 목록이 일치합니다.
 */
async function refreshRegionReviewStatistic(regionId: number, db: DbClient): Promise<number> {
  const aggregated = await residenceReviewRepository.aggregateVisibleRatingByRegion(regionId, db);
  const reviewCount = aggregated._count._all;
  const ratingSum = aggregated._sum.rating ?? 0;
  const averageRating = roundAverageRating(ratingSum, reviewCount);

  await residenceReviewRepository.upsertRegionReviewStatistic(
    {
      regionId,
      ratingSum,
      reviewCount,
      averageRating,
    },
    db,
  );

  return averageRating;
}

async function assertRegionExists(regionId: number, db?: DbClient): Promise<void> {
  const region = await residenceReviewRepository.findRegionById(regionId, db);

  if (!region) {
    throw new AppError("REGION_NOT_FOUND");
  }
}

async function findOwnedVisibleResidenceReviewOrThrow(
  residenceReviewId: number,
  authorId: string,
  db?: DbClient,
) {
  const review = await residenceReviewRepository.findOwnership(residenceReviewId, db);

  if (!review || review.isHidden) {
    throw new AppError("RESIDENCE_REVIEW_NOT_FOUND");
  }

  if (review.authorId !== authorId) {
    throw new AppError("FORBIDDEN");
  }

  return review;
}

async function getPublicResidenceReviewList(query: ListResidenceReviewQuery, viewerId?: string) {
  const { cursor, limit, regionId, keyword, rating, sort } = query;
  const cursorQuery = toResidenceReviewCursorQuery({ sort, keyword, regionId, rating });
  const decodedCursor = decodeResidenceReviewCursor(cursor, cursorQuery);

  if (regionId !== undefined) {
    await assertRegionExists(regionId);
  }

  const { reviews, totalCount } = await residenceReviewRepository.findManyByCursorWithCount({
    take: limit + 1,
    sort,
    ...(regionId !== undefined ? { regionId } : {}),
    ...(keyword !== undefined ? { keyword } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(decodedCursor ? { cursor: decodedCursor } : {}),
  });

  const { pageReviews, hasNext } = sliceResidenceReviewCursorPage(reviews, limit);

  return {
    reviews: pageReviews.map((review) => toPublicResidenceReview(review, viewerId)),
    pagination: {
      limit,
      totalCount,
      hasNext,
      nextCursor: encodeResidenceReviewNextCursor(pageReviews.at(-1), hasNext, cursorQuery),
    } satisfies CursorPagination,
  };
}

async function getPublicResidenceReviewById(residenceReviewId: number, viewerId?: string) {
  const review = await residenceReviewRepository.findPublicById(residenceReviewId);

  if (!review) {
    throw new AppError("RESIDENCE_REVIEW_NOT_FOUND");
  }

  return toPublicResidenceReview(review, viewerId);
}

async function getRegionReviewStatistic(regionId: number): Promise<RegionReviewStatistic> {
  const region = await residenceReviewRepository.findRegionById(regionId);

  if (!region) {
    throw new AppError("REGION_NOT_FOUND");
  }

  const statistic = await residenceReviewRepository.findRegionReviewStatisticByRegionId(regionId);

  if (!statistic) {
    return {
      region,
      ratingSum: 0,
      reviewCount: 0,
      averageRating: 0,
    };
  }

  return {
    region: statistic.region,
    ratingSum: statistic.ratingSum,
    reviewCount: statistic.reviewCount,
    averageRating: Number(statistic.averageRating),
  };
}

/**
 * 내 후기는 본인 작성분만 보고, 보통 건수가 많지 않아
 * 페이지 번호로 특정 위치를 바로 열 수 있는 offset 페이지네이션을 유지합니다.
 * 공개 목록의 무한 스크롤(cursor)과는 조회 목적이 다릅니다.
 */
async function getMyResidenceReviewList(authorId: string, query: ListMyResidenceReviewQuery) {
  const { page, limit } = query;

  const { reviews, totalCount } = await residenceReviewRepository.findManyWithCount({
    skip: (page - 1) * limit,
    take: limit,
    where: {
      authorId,
      isHidden: RESIDENCE_REVIEW_VISIBILITY.PUBLIC,
    },
  });

  return {
    reviews: reviews.map((review) => toResidenceReviewItem(review)),
    pagination: buildPagination(totalCount, page, limit),
  };
}

async function createResidenceReview(authorId: string, input: CreateResidenceReviewInput) {
  return runTransaction(
    async (tx) => {
      await assertRegionExists(input.regionId, tx);

      const review = await residenceReviewRepository.createResidenceReview(authorId, input, tx);
      const averageRating = await refreshRegionReviewStatistic(input.regionId, tx);

      return toPublicResidenceReview(review, authorId, averageRating);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

function toUpdateData(input: UpdateResidenceReviewInput) {
  const data: {
    title?: string;
    content?: string;
    rating?: number;
  } = {};

  if (input.title !== undefined) {
    data.title = input.title;
  }

  if (input.content !== undefined) {
    data.content = input.content;
  }

  if (input.rating !== undefined) {
    data.rating = input.rating;
  }

  return data;
}

function shouldRefreshStatisticOnUpdate(
  currentRating: number,
  input: UpdateResidenceReviewInput,
): boolean {
  return input.rating !== undefined && input.rating !== currentRating;
}

async function updateResidenceReview(
  residenceReviewId: number,
  authorId: string,
  input: UpdateResidenceReviewInput,
) {
  return runTransaction(
    async (tx) => {
      const owned = await findOwnedVisibleResidenceReviewOrThrow(residenceReviewId, authorId, tx);
      const review = await residenceReviewRepository.updateResidenceReview(
        residenceReviewId,
        toUpdateData(input),
        tx,
      );

      const averageRating = shouldRefreshStatisticOnUpdate(owned.rating, input)
        ? await refreshRegionReviewStatistic(owned.regionId, tx)
        : undefined;

      return toPublicResidenceReview(review, authorId, averageRating);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

async function deleteResidenceReview(residenceReviewId: number, authorId: string) {
  return runTransaction(
    async (tx) => {
      const owned = await findOwnedVisibleResidenceReviewOrThrow(residenceReviewId, authorId, tx);

      await residenceReviewRepository.deleteResidenceReview(residenceReviewId, tx);
      await refreshRegionReviewStatistic(owned.regionId, tx);

      return { id: residenceReviewId };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export const residenceReviewService = {
  getPublicResidenceReviewList,
  getPublicResidenceReviewById,
  getRegionReviewStatistic,
  getMyResidenceReviewList,
  createResidenceReview,
  updateResidenceReview,
  deleteResidenceReview,
  refreshRegionReviewStatistic,
};
