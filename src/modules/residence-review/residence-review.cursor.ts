import { AppError } from "../../lib/app-error";
import type {
  ResidenceReviewCursor,
  ResidenceReviewCursorQuery,
  ResidenceReviewListSort,
} from "./residence-review.type";
import { RESIDENCE_REVIEW_RATING } from "./residence-review.validator";

type SerializedResidenceReviewCursor = {
  sort: ResidenceReviewListSort;
  ratingCursor: number;
  createdAt: string;
  id: number;
  keyword?: string;
  regionId?: number;
  rating?: number;
};

type ResidenceReviewCursorPosition = {
  rating: number;
  createdAt: Date;
  id: number;
};

type ResidenceReviewCursorQueryInput = {
  sort: ResidenceReviewListSort;
  keyword?: string | undefined;
  regionId?: number | undefined;
  rating?: number | undefined;
};

function isSameOptionalValue<T>(left: T | undefined, right: T | undefined): boolean {
  return left === right;
}

function isValidRatingValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= RESIDENCE_REVIEW_RATING.MIN &&
    value <= RESIDENCE_REVIEW_RATING.MAX
  );
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function toResidenceReviewCursorQuery(
  query: ResidenceReviewCursorQueryInput,
): ResidenceReviewCursorQuery {
  return {
    sort: query.sort,
    ...(query.keyword !== undefined ? { keyword: query.keyword } : {}),
    ...(query.regionId !== undefined ? { regionId: query.regionId } : {}),
    ...(query.rating !== undefined ? { rating: query.rating } : {}),
  };
}

export function sliceResidenceReviewCursorPage<T>(
  reviews: T[],
  limit: number,
): {
  pageReviews: T[];
  hasNext: boolean;
} {
  const hasNext = reviews.length > limit;

  return {
    pageReviews: reviews.slice(0, limit),
    hasNext,
  };
}

export function encodeResidenceReviewCursor(cursor: ResidenceReviewCursor): string {
  return Buffer.from(
    JSON.stringify({
      sort: cursor.sort,
      ratingCursor: cursor.ratingCursor,
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
      ...(cursor.keyword !== undefined ? { keyword: cursor.keyword } : {}),
      ...(cursor.regionId !== undefined ? { regionId: cursor.regionId } : {}),
      ...(cursor.rating !== undefined ? { rating: cursor.rating } : {}),
    } satisfies SerializedResidenceReviewCursor),
  ).toString("base64url");
}

export function encodeResidenceReviewNextCursor(
  lastReview: ResidenceReviewCursorPosition | undefined,
  hasNext: boolean,
  query: ResidenceReviewCursorQuery,
): string | null {
  if (!hasNext || lastReview === undefined) {
    return null;
  }

  return encodeResidenceReviewCursor({
    ...query,
    ratingCursor: lastReview.rating,
    createdAt: lastReview.createdAt,
    id: lastReview.id,
  });
}

export function decodeResidenceReviewCursor(
  cursor: string | undefined,
  query: ResidenceReviewCursorQuery,
): ResidenceReviewCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<SerializedResidenceReviewCursor>;
    const createdAt = new Date(decoded.createdAt ?? "");
    const id = decoded.id;

    if (
      decoded.sort !== query.sort ||
      !isSameOptionalValue(decoded.keyword, query.keyword) ||
      !isSameOptionalValue(decoded.regionId, query.regionId) ||
      !isSameOptionalValue(decoded.rating, query.rating) ||
      Number.isNaN(createdAt.getTime()) ||
      !isValidRatingValue(decoded.ratingCursor) ||
      !isPositiveInt(id)
    ) {
      throw new Error("Invalid cursor");
    }

    return {
      sort: query.sort,
      ratingCursor: decoded.ratingCursor,
      createdAt,
      id,
      ...(query.keyword !== undefined ? { keyword: query.keyword } : {}),
      ...(query.regionId !== undefined ? { regionId: query.regionId } : {}),
      ...(query.rating !== undefined ? { rating: query.rating } : {}),
    };
  } catch {
    throw new AppError("VALIDATION_ERROR", {
      message: "유효하지 않은 거주후기 목록 커서입니다.",
    });
  }
}
