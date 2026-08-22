import { AppError } from "../../lib/app-error";
import type {
  GiveawayCursor,
  GiveawayCursorQuery,
  GiveawayListSortValue,
  GiveawayRequestCursor,
  GiveawayRequestCursorQuery,
} from "./giveaway.type";

type SerializedGiveawayCursor = {
  sort: GiveawayListSortValue;
  createdAt: string;
  id: number;
  status?: GiveawayCursorQuery["status"];
  regionId?: number;
  keyword?: string;
};

type SerializedGiveawayRequestCursor = {
  sort: GiveawayListSortValue;
  createdAt: string;
  id: number;
  status?: GiveawayRequestCursorQuery["status"];
  keyword?: string;
};

type GiveawayCursorPosition = {
  createdAt: Date;
  id: number;
};

type GiveawayCursorQueryInput = {
  sort: GiveawayListSortValue;
  status?: GiveawayCursorQuery["status"] | undefined;
  regionId?: number | undefined;
  keyword?: string | undefined;
};

type GiveawayRequestCursorQueryInput = {
  sort: GiveawayListSortValue;
  status?: GiveawayRequestCursorQuery["status"] | undefined;
  keyword?: string | undefined;
};

function isSameOptionalValue<T>(left: T | undefined, right: T | undefined): boolean {
  return left === right;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseCursorCreatedAtId(decoded: {
  createdAt?: string;
  id?: unknown;
}): GiveawayCursorPosition {
  const createdAt = new Date(decoded.createdAt ?? "");
  const id = decoded.id;

  if (Number.isNaN(createdAt.getTime()) || !isPositiveInt(id)) {
    throw new Error("Invalid cursor");
  }

  return { createdAt, id };
}

export function toGiveawayCursorQuery(query: GiveawayCursorQueryInput): GiveawayCursorQuery {
  return {
    sort: query.sort,
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.regionId !== undefined ? { regionId: query.regionId } : {}),
    ...(query.keyword !== undefined ? { keyword: query.keyword } : {}),
  };
}

export function toGiveawayRequestCursorQuery(
  query: GiveawayRequestCursorQueryInput,
): GiveawayRequestCursorQuery {
  return {
    sort: query.sort,
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.keyword !== undefined ? { keyword: query.keyword } : {}),
  };
}

export function sliceGiveawayCursorPage<T>(
  items: T[],
  limit: number,
): {
  pageItems: T[];
  hasNext: boolean;
} {
  const hasNext = items.length > limit;

  return {
    pageItems: items.slice(0, limit),
    hasNext,
  };
}

export function encodeGiveawayCursor(cursor: GiveawayCursor): string {
  return Buffer.from(
    JSON.stringify({
      sort: cursor.sort,
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
      ...(cursor.status !== undefined ? { status: cursor.status } : {}),
      ...(cursor.regionId !== undefined ? { regionId: cursor.regionId } : {}),
      ...(cursor.keyword !== undefined ? { keyword: cursor.keyword } : {}),
    } satisfies SerializedGiveawayCursor),
  ).toString("base64url");
}

export function encodeGiveawayRequestCursor(cursor: GiveawayRequestCursor): string {
  return Buffer.from(
    JSON.stringify({
      sort: cursor.sort,
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
      ...(cursor.status !== undefined ? { status: cursor.status } : {}),
      ...(cursor.keyword !== undefined ? { keyword: cursor.keyword } : {}),
    } satisfies SerializedGiveawayRequestCursor),
  ).toString("base64url");
}

export function encodeGiveawayNextCursor(
  lastItem: GiveawayCursorPosition | undefined,
  hasNext: boolean,
  query: GiveawayCursorQuery,
): string | null {
  if (!hasNext || lastItem === undefined) {
    return null;
  }

  return encodeGiveawayCursor({
    ...query,
    createdAt: lastItem.createdAt,
    id: lastItem.id,
  });
}

export function encodeGiveawayRequestNextCursor(
  lastItem: GiveawayCursorPosition | undefined,
  hasNext: boolean,
  query: GiveawayRequestCursorQuery,
): string | null {
  if (!hasNext || lastItem === undefined) {
    return null;
  }

  return encodeGiveawayRequestCursor({
    ...query,
    createdAt: lastItem.createdAt,
    id: lastItem.id,
  });
}

export function decodeGiveawayCursor(
  cursor: string | undefined,
  query: GiveawayCursorQuery,
): GiveawayCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<SerializedGiveawayCursor>;
    const position = parseCursorCreatedAtId(decoded);

    if (
      decoded.sort !== query.sort ||
      !isSameOptionalValue(decoded.status, query.status) ||
      !isSameOptionalValue(decoded.regionId, query.regionId) ||
      !isSameOptionalValue(decoded.keyword, query.keyword)
    ) {
      throw new Error("Invalid cursor");
    }

    return {
      ...query,
      createdAt: position.createdAt,
      id: position.id,
    };
  } catch {
    throw new AppError("VALIDATION_ERROR", {
      message: "유효하지 않은 나눔 목록 커서입니다.",
    });
  }
}

export function decodeGiveawayRequestCursor(
  cursor: string | undefined,
  query: GiveawayRequestCursorQuery,
): GiveawayRequestCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<SerializedGiveawayRequestCursor>;
    const position = parseCursorCreatedAtId(decoded);

    if (
      decoded.sort !== query.sort ||
      !isSameOptionalValue(decoded.status, query.status) ||
      !isSameOptionalValue(decoded.keyword, query.keyword)
    ) {
      throw new Error("Invalid cursor");
    }

    return {
      ...query,
      createdAt: position.createdAt,
      id: position.id,
    };
  } catch {
    throw new AppError("VALIDATION_ERROR", {
      message: "유효하지 않은 나눔 신청 목록 커서입니다.",
    });
  }
}
