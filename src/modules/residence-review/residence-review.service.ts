import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";
import { runTransaction } from "../../utils/transaction";
import type { DbClient } from "../../utils/transaction";
import { residenceReviewRepository } from "./residence-review.repository";
import type { ResidenceReviewRow } from "./residence-review.repository";
import { REGION_REVIEW_STATISTIC, RESIDENCE_REVIEW_VISIBILITY } from "./residence-review.type";
import type {
  CreateResidenceReviewInput,
  ListMyResidenceReviewQuery,
  ListResidenceReviewQuery,
  MyResidenceReview,
  PublicResidenceReview,
  UpdateResidenceReviewInput,
} from "./residence-review.type";

function toPublicResidenceReview(row: ResidenceReviewRow): PublicResidenceReview {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    rating: row.rating,
    region: row.region,
    author: row.author,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMyResidenceReview(row: ResidenceReviewRow): MyResidenceReview {
  return {
    ...toPublicResidenceReview(row),
    isHidden: row.isHidden,
  };
}

function roundAverageRating(ratingSum: number, reviewCount: number): number {
  if (reviewCount === 0) {
    return 0;
  }

  const factor = 10 ** REGION_REVIEW_STATISTIC.AVERAGE_DECIMAL_PLACES;

  return Math.round((ratingSum / reviewCount) * factor) / factor;
}

async function refreshRegionReviewStatistic(regionId: number, db: DbClient): Promise<void> {
  const aggregated = await residenceReviewRepository.aggregateVisibleRatingByRegion(regionId, db);
  const reviewCount = aggregated._count._all;
  const ratingSum = aggregated._sum.rating ?? 0;

  await residenceReviewRepository.upsertRegionReviewStatistic(
    {
      regionId,
      ratingSum,
      reviewCount,
      averageRating: roundAverageRating(ratingSum, reviewCount),
    },
    db,
  );
}

async function assertRegionExists(regionId: number, db?: DbClient): Promise<void> {
  const region = await residenceReviewRepository.findRegionById(regionId, db);

  if (!region) {
    throw new AppError("REGION_NOT_FOUND");
  }
}

async function findOwnedResidenceReviewOrThrow(
  residenceReviewId: number,
  authorId: string,
  db?: DbClient,
) {
  const review = await residenceReviewRepository.findOwnership(residenceReviewId, db);

  if (!review) {
    throw new AppError("RESIDENCE_REVIEW_NOT_FOUND");
  }

  if (review.authorId !== authorId) {
    throw new AppError("FORBIDDEN");
  }

  return review;
}

async function getPublicResidenceReviewList(query: ListResidenceReviewQuery) {
  const { page, limit, regionId } = query;

  const where: Prisma.ResidenceReviewWhereInput = {
    isHidden: RESIDENCE_REVIEW_VISIBILITY.PUBLIC,
    ...(regionId !== undefined ? { regionId } : {}),
  };

  const { reviews, totalCount } = await residenceReviewRepository.findManyWithCount({
    skip: (page - 1) * limit,
    take: limit,
    where,
  });

  return {
    reviews: reviews.map(toPublicResidenceReview),
    pagination: buildPagination(totalCount, page, limit),
  };
}

async function getPublicResidenceReviewById(residenceReviewId: number) {
  const review = await residenceReviewRepository.findPublicById(residenceReviewId);

  if (!review) {
    throw new AppError("RESIDENCE_REVIEW_NOT_FOUND");
  }

  return toPublicResidenceReview(review);
}

async function getMyResidenceReviewList(authorId: string, query: ListMyResidenceReviewQuery) {
  const { page, limit } = query;

  const { reviews, totalCount } = await residenceReviewRepository.findManyWithCount({
    skip: (page - 1) * limit,
    take: limit,
    where: { authorId },
  });

  return {
    reviews: reviews.map(toMyResidenceReview),
    pagination: buildPagination(totalCount, page, limit),
  };
}

async function createResidenceReview(authorId: string, input: CreateResidenceReviewInput) {
  return runTransaction(
    async (tx) => {
      await assertRegionExists(input.regionId, tx);

      const review = await residenceReviewRepository.createResidenceReview(authorId, input, tx);

      await refreshRegionReviewStatistic(input.regionId, tx);

      return toMyResidenceReview(review);
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

async function updateResidenceReview(
  residenceReviewId: number,
  authorId: string,
  input: UpdateResidenceReviewInput,
) {
  return runTransaction(
    async (tx) => {
      const owned = await findOwnedResidenceReviewOrThrow(residenceReviewId, authorId, tx);
      const review = await residenceReviewRepository.updateResidenceReview(
        residenceReviewId,
        toUpdateData(input),
        tx,
      );

      await refreshRegionReviewStatistic(owned.regionId, tx);

      return toMyResidenceReview(review);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

async function deleteResidenceReview(residenceReviewId: number, authorId: string) {
  return runTransaction(
    async (tx) => {
      const owned = await findOwnedResidenceReviewOrThrow(residenceReviewId, authorId, tx);

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
  getMyResidenceReviewList,
  createResidenceReview,
  updateResidenceReview,
  deleteResidenceReview,
};
