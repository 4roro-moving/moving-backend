/** 관리자 나눔 목록 정렬 기준. validator / repository 가 동일 소스를 사용합니다. */
export const ADMIN_GIVEAWAY_SORTS = ["LATEST", "OLDEST", "REPORT_HIGH"] as const;

export type AdminGiveawaySort = (typeof ADMIN_GIVEAWAY_SORTS)[number];

export type SortDirection = "asc" | "desc";

export type GiveawaySortField = "createdAt" | "id";

export interface GiveawaySortClause {
  field: GiveawaySortField;
  dir: SortDirection;
}

/**
 * 정렬 의미(규칙)의 단일 소스.
 * Prisma orderBy / raw SQL ORDER BY 는 이 규칙을 변환해 사용합니다.
 */
export const ADMIN_GIVEAWAY_SORT_RULES: Record<
  Exclude<AdminGiveawaySort, "REPORT_HIGH">,
  readonly GiveawaySortClause[]
> = {
  LATEST: [
    { field: "createdAt", dir: "desc" },
    { field: "id", dir: "desc" },
  ],
  OLDEST: [
    { field: "createdAt", dir: "asc" },
    { field: "id", dir: "asc" },
  ],
};

/** REPORT_HIGH 의 tie-break 규칙 (신고 건수 DESC 다음) */
export const REPORT_HIGH_TIE_BREAK: readonly GiveawaySortClause[] = [
  { field: "createdAt", dir: "desc" },
  { field: "id", dir: "desc" },
];
