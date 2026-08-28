import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";
import { RESIDENCE_REVIEW_LIST_SORT, RESIDENCE_REVIEW_VISIBILITY } from "./residence-review.type";
import type {
  CreateResidenceReviewInput,
  ResidenceReviewCursor,
  ResidenceReviewListSort,
} from "./residence-review.type";

const residenceReviewSelect = {
  id: true,
  title: true,
  content: true,
  rating: true,
  createdAt: true,
  updatedAt: true,
  region: {
    select: {
      id: true,
      name: true,
      reviewStatistic: {
        select: {
          averageRating: true,
        },
      },
    },
  },
  author: {
    select: {
      id: true,
      name: true,
      customerProfile: {
        select: {
          imageUrl: true,
        },
      },
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
  rating: true,
  isHidden: true,
} satisfies Prisma.ResidenceReviewSelect;

export type ResidenceReviewOwnership = Prisma.ResidenceReviewGetPayload<{
  select: typeof ownershipSelect;
}>;

type ListParams = {
  skip: number;
  take: number;
  where: Prisma.ResidenceReviewWhereInput;
};

type FindPublicListParams = {
  take: number;
  sort: ResidenceReviewListSort;
  regionId?: number | undefined;
  keyword?: string | undefined;
  rating?: number | undefined;
  cursor?: ResidenceReviewCursor | undefined;
};

type ListWhereParams = {
  regionId?: number | undefined;
  keyword?: string | undefined;
  rating?: number | undefined;
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

function buildListWhere({
  regionId,
  keyword,
  rating,
}: ListWhereParams): Prisma.ResidenceReviewWhereInput {
  return {
    isHidden: RESIDENCE_REVIEW_VISIBILITY.PUBLIC,
    ...(regionId !== undefined ? { regionId } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword, mode: "insensitive" } },
            { content: { contains: keyword, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function buildListOrderBy(
  sort: ResidenceReviewListSort,
): Prisma.ResidenceReviewOrderByWithRelationInput[] {
  if (sort === RESIDENCE_REVIEW_LIST_SORT.RATING) {
    return [{ rating: "desc" }, { createdAt: "desc" }, { id: "desc" }];
  }

  if (sort === RESIDENCE_REVIEW_LIST_SORT.CREATED_AT_ASC) {
    return [{ createdAt: "asc" }, { id: "asc" }];
  }

  return [{ createdAt: "desc" }, { id: "desc" }];
}

export function buildCursorCondition(
  cursor: ResidenceReviewCursor,
): Prisma.ResidenceReviewWhereInput {
  if (cursor.sort === RESIDENCE_REVIEW_LIST_SORT.RATING) {
    return {
      OR: [
        { rating: { lt: cursor.ratingCursor } },
        { rating: cursor.ratingCursor, createdAt: { lt: cursor.createdAt } },
        {
          rating: cursor.ratingCursor,
          createdAt: cursor.createdAt,
          id: { lt: cursor.id },
        },
      ],
    };
  }

  if (cursor.sort === RESIDENCE_REVIEW_LIST_SORT.CREATED_AT_ASC) {
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

function applyCursor(
  where: Prisma.ResidenceReviewWhereInput,
  cursor?: ResidenceReviewCursor,
): Prisma.ResidenceReviewWhereInput {
  if (!cursor) {
    return where;
  }

  return {
    AND: [where, buildCursorCondition(cursor)],
  };
}

async function findManyByCursorWithCount(
  { take, sort, regionId, keyword, rating, cursor }: FindPublicListParams,
  db: DbClient = prisma,
): Promise<{ reviews: ResidenceReviewRow[]; totalCount: number | null }> {
  const where = buildListWhere({ regionId, keyword, rating });
  const [reviews, totalCount] = await Promise.all([
    db.residenceReview.findMany({
      where: applyCursor(where, cursor),
      select: residenceReviewSelect,
      orderBy: buildListOrderBy(sort),
      take,
    }),
    // 무한 스크롤 다음 페이지에서는 같은 필터의 전체 건수를 다시 세지 않습니다.
    cursor == null ? db.residenceReview.count({ where }) : Promise.resolve(null),
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
  findPublicById,
  findManyWithCount,
  findManyByCursorWithCount,
  createResidenceReview,
  updateResidenceReview,
  deleteResidenceReview,
  aggregateVisibleRatingByRegion,
  findRegionReviewStatisticByRegionId,
  upsertRegionReviewStatistic,
};
