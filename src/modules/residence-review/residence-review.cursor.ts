import { AppError } from "../../lib/app-error";
import type { ResidenceReviewCursor, ResidenceReviewListSort } from "./residence-review.type";
import { RESIDENCE_REVIEW_LIST_SORT, RESIDENCE_REVIEW_RATING } from "./residence-review.validator";

type SerializedResidenceReviewCursor = {
  sort: ResidenceReviewListSort;
  rating: number;
  createdAt: string;
  id: number;
};

const LIST_SORTS = new Set<string>(Object.values(RESIDENCE_REVIEW_LIST_SORT));

export function encodeResidenceReviewCursor(cursor: ResidenceReviewCursor): string {
  return Buffer.from(
    JSON.stringify({
      sort: cursor.sort,
      rating: cursor.rating,
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    } satisfies SerializedResidenceReviewCursor),
  ).toString("base64url");
}

export function decodeResidenceReviewCursor(
  cursor: string | undefined,
  sort: ResidenceReviewListSort,
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
      !LIST_SORTS.has(decoded.sort ?? "") ||
      decoded.sort !== sort ||
      Number.isNaN(createdAt.getTime()) ||
      !Number.isInteger(decoded.rating) ||
      (decoded.rating ?? 0) < RESIDENCE_REVIEW_RATING.MIN ||
      (decoded.rating ?? 0) > RESIDENCE_REVIEW_RATING.MAX ||
      !Number.isInteger(decoded.id) ||
      (decoded.id ?? 0) <= 0
    ) {
      throw new Error("Invalid cursor");
    }

    return {
      sort,
      rating: decoded.rating as number,
      createdAt,
      id: decoded.id as number,
    };
  } catch {
    throw new AppError("VALIDATION_ERROR", {
      message: "유효하지 않은 거주후기 목록 커서입니다.",
    });
  }
}
