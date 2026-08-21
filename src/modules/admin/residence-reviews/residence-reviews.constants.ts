/** 관리자 거주후기 목록 정렬 기준. validator / repository 가 동일 소스를 사용합니다. */
export const ADMIN_RESIDENCE_REVIEW_SORTS = [
  "LATEST",
  "OLDEST",
  "RATING_HIGH",
  "RATING_LOW",
  "REPORT_HIGH",
] as const;

export type AdminResidenceReviewSort = (typeof ADMIN_RESIDENCE_REVIEW_SORTS)[number];

export type SortDirection = "asc" | "desc";

export type ResidenceReviewSortField = "createdAt" | "id" | "rating";

export interface ResidenceReviewSortClause {
  field: ResidenceReviewSortField;
  dir: SortDirection;
}

/**
 * 정렬 의미(규칙)의 단일 소스.
 * Prisma orderBy / raw SQL ORDER BY 는 이 규칙을 변환해 사용합니다.
 */
export const ADMIN_RESIDENCE_REVIEW_SORT_RULES: Record<
  Exclude<AdminResidenceReviewSort, "REPORT_HIGH">,
  readonly ResidenceReviewSortClause[]
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
export const REPORT_HIGH_TIE_BREAK: readonly ResidenceReviewSortClause[] = [
  { field: "createdAt", dir: "desc" },
  { field: "id", dir: "desc" },
];
