/** 관리자 리뷰 목록 정렬 기준. validator / repository 가 동일 소스를 사용합니다. */
export const ADMIN_REVIEW_SORTS = [
  "LATEST",
  "OLDEST",
  "RATING_HIGH",
  "RATING_LOW",
  "REPORT_HIGH",
] as const;

export type AdminReviewSort = (typeof ADMIN_REVIEW_SORTS)[number];

export type SortDirection = "asc" | "desc";

export type ReviewSortField = "createdAt" | "id" | "rating";

export interface ReviewSortClause {
  field: ReviewSortField;
  dir: SortDirection;
}

/**
 * 정렬 의미(규칙)의 단일 소스.
 * Prisma orderBy / raw SQL ORDER BY 는 이 규칙을 변환해 사용합니다.
 */
export const ADMIN_REVIEW_SORT_RULES: Record<
  Exclude<AdminReviewSort, "REPORT_HIGH">,
  readonly ReviewSortClause[]
> = {
  LATEST: [
    { field: "createdAt", dir: "desc" },
    { field: "id", dir: "desc" },
  ],
  OLDEST: [
    { field: "createdAt", dir: "asc" },
    { field: "id", dir: "asc" },
  ],
  RATING_HIGH: [
    { field: "rating", dir: "desc" },
    { field: "createdAt", dir: "desc" },
    { field: "id", dir: "desc" },
  ],
  RATING_LOW: [
    { field: "rating", dir: "asc" },
    { field: "createdAt", dir: "desc" },
    { field: "id", dir: "desc" },
  ],
};

/** REPORT_HIGH 의 tie-break 규칙 (신고 건수 DESC 다음) */
export const REPORT_HIGH_TIE_BREAK: readonly ReviewSortClause[] = [
  { field: "createdAt", dir: "desc" },
  { field: "id", dir: "desc" },
];
