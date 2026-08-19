import { AppError } from "../../lib/app-error";
import type { ResidenceReviewCursor, ResidenceReviewCursorQuery } from "./residence-review.type";
import { RESIDENCE_REVIEW_RATING } from "./residence-review.validator";

type SerializedResidenceReviewCursor = {
  sort: ResidenceReviewCursorQuery["sort"];
  ratingCursor: number;
  createdAt: string;
  id: number;
  keyword?: string;
  regionId?: number;
  rating?: number;
};

function isSameOptionalValue<T>(left: T | undefined, right: T | undefined): boolean {
  return left === right;
}

function isValidRatingValue(value: number | undefined): value is number {
  return (
    value !== undefined &&
    Number.isInteger(value) &&
    value >= RESIDENCE_REVIEW_RATING.MIN &&
    value <= RESIDENCE_REVIEW_RATING.MAX
  );
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

    if (
      decoded.sort !== query.sort ||
      !isSameOptionalValue(decoded.keyword, query.keyword) ||
      !isSameOptionalValue(decoded.regionId, query.regionId) ||
      !isSameOptionalValue(decoded.rating, query.rating) ||
      Number.isNaN(createdAt.getTime()) ||
      !isValidRatingValue(decoded.ratingCursor) ||
      !Number.isInteger(decoded.id) ||
      (decoded.id ?? 0) <= 0
    ) {
      throw new Error("Invalid cursor");
    }

    return {
      sort: query.sort,
      ratingCursor: decoded.ratingCursor,
      createdAt,
      id: decoded.id as number,
      keyword: query.keyword,
      regionId: query.regionId,
      rating: query.rating,
    };
  } catch {
    throw new AppError("VALIDATION_ERROR", {
      message: "유효하지 않은 거주후기 목록 커서입니다.",
    });
  }
}
