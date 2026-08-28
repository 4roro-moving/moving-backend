import { AppError } from "../../lib/app-error";
import type { FavoriteMoverCursor } from "./favorite.type";

type SerializedFavoriteMoverCursor = {
  createdAt: string;
  id: number;
};

export function encodeFavoriteMoverCursor(cursor: FavoriteMoverCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    } satisfies SerializedFavoriteMoverCursor),
  ).toString("base64url");
}

export function decodeFavoriteMoverCursor(
  cursor: string | undefined,
): FavoriteMoverCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<SerializedFavoriteMoverCursor>;
    const createdAt = new Date(decoded.createdAt ?? "");

    if (
      Number.isNaN(createdAt.getTime()) ||
      !Number.isInteger(decoded.id) ||
      (decoded.id ?? 0) <= 0
    ) {
      throw new Error("Invalid cursor");
    }

    return { createdAt, id: decoded.id as number };
  } catch {
    throw new AppError("VALIDATION_ERROR", {
      message: "유효하지 않은 찜 목록 커서입니다.",
    });
  }
}
