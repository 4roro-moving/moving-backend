import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";
import { RESIDENCE_REVIEW_VISIBILITY } from "./residence-review.type";
import type { CreateResidenceReviewInput } from "./residence-review.type";

const residenceReviewSelect = {
  id: true,
  title: true,
  content: true,
  rating: true,
  isHidden: true,
  createdAt: true,
  updatedAt: true,
  region: {
    select: {
      id: true,
      name: true,
    },
  },
  author: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ResidenceReviewSelect;

export type ResidenceReviewRow = Prisma.ResidenceReviewGetPayload<{
  select: typeof residenceReviewSelect;
}>;

const ownershipSelect = {
  id: true,
  authorId: true,
  regionId: true,
} satisfies Prisma.ResidenceReviewSelect;

export type ResidenceReviewOwnership = Prisma.ResidenceReviewGetPayload<{
  select: typeof ownershipSelect;
}>;

type ListParams = {
  skip: number;
  take: number;
  where: Prisma.ResidenceReviewWhereInput;
};

type UpdateResidenceReviewData = {
  title?: string;
  content?: string;
  rating?: number;
};

type RegionReviewStatisticValues = {
  regionId: number;
  ratingSum: number;
  reviewCount: number;
  averageRating: number;
};

function findRegionById(regionId: number, db: DbClient = prisma) {
  return db.region.findUnique({
    where: { id: regionId },
    select: {
      id: true,
      name: true,
    },
  });
}

function findOwnership(residenceReviewId: number, db: DbClient = prisma) {
  return db.residenceReview.findUnique({
    where: { id: residenceReviewId },
    select: ownershipSelect,
  });
}

function findById(residenceReviewId: number, db: DbClient = prisma) {
  return db.residenceReview.findUnique({
    where: { id: residenceReviewId },
    select: residenceReviewSelect,
  });
}

function findPublicById(residenceReviewId: number, db: DbClient = prisma) {
  return db.residenceReview.findFirst({
    where: {
      id: residenceReviewId,
      isHidden: RESIDENCE_REVIEW_VISIBILITY.PUBLIC,
    },
    select: residenceReviewSelect,
  });
}

async function findManyWithCount({ skip, take, where }: ListParams, db: DbClient = prisma) {
  const [reviews, totalCount] = await Promise.all([
    db.residenceReview.findMany({
      where,
      select: residenceReviewSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    db.residenceReview.count({ where }),
  ]);

  return { reviews, totalCount };
}

function createResidenceReview(
  authorId: string,
  input: CreateResidenceReviewInput,
  db: DbClient = prisma,
) {
  return db.residenceReview.create({
    data: {
      authorId,
      regionId: input.regionId,
      title: input.title,
      content: input.content,
      rating: input.rating,
    },
    select: residenceReviewSelect,
  });
}

function updateResidenceReview(
  residenceReviewId: number,
  data: UpdateResidenceReviewData,
  db: DbClient = prisma,
) {
  return db.residenceReview.update({
    where: { id: residenceReviewId },
    data,
    select: residenceReviewSelect,
  });
}

function deleteResidenceReview(residenceReviewId: number, db: DbClient = prisma) {
  return db.residenceReview.delete({
    where: { id: residenceReviewId },
  });
}

function aggregateVisibleRatingByRegion(regionId: number, db: DbClient = prisma) {
  return db.residenceReview.aggregate({
    where: {
      regionId,
      isHidden: RESIDENCE_REVIEW_VISIBILITY.PUBLIC,
    },
    _sum: {
      rating: true,
    },
    _count: {
      _all: true,
    },
  });
}

function findRegionReviewStatisticByRegionId(regionId: number, db: DbClient = prisma) {
  return db.regionReviewStatistic.findUnique({
    where: { regionId },
    select: {
      ratingSum: true,
      reviewCount: true,
      averageRating: true,
      region: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

function upsertRegionReviewStatistic(
  { regionId, ratingSum, reviewCount, averageRating }: RegionReviewStatisticValues,
  db: DbClient = prisma,
) {
  const averageRatingDecimal = new Prisma.Decimal(averageRating);

  return db.regionReviewStatistic.upsert({
    where: { regionId },
    create: {
      regionId,
      ratingSum,
      reviewCount,
      averageRating: averageRatingDecimal,
    },
    update: {
      ratingSum,
      reviewCount,
      averageRating: averageRatingDecimal,
    },
  });
}

export const residenceReviewRepository = {
  findRegionById,
  findOwnership,
  findById,
  findPublicById,
  findManyWithCount,
  createResidenceReview,
  updateResidenceReview,
  deleteResidenceReview,
  aggregateVisibleRatingByRegion,
  findRegionReviewStatisticByRegionId,
  upsertRegionReviewStatistic,
};
