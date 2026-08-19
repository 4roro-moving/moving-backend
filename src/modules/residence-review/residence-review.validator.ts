import { z } from "zod";

export const RESIDENCE_REVIEW_RATING = {
  MIN: 1,
  MAX: 5,
} as const;

export const RESIDENCE_REVIEW_TITLE_LENGTH = {
  MIN: 1,
  MAX: 100,
} as const;

export const RESIDENCE_REVIEW_CONTENT_LENGTH = {
  MIN: 1,
  MAX: 2000,
} as const;

export const RESIDENCE_REVIEW_LIST_QUERY = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_PAGE: 10000,
  MAX_LIMIT: 50,
  MAX_CURSOR_LENGTH: 500,
  MAX_KEYWORD_LENGTH: 100,
} as const;

export const RESIDENCE_REVIEW_LIST_SORT = {
  CREATED_AT: "createdAt",
  CREATED_AT_ASC: "createdAtAsc",
  RATING: "rating",
} as const;

const VALIDATION_MESSAGE = {
  TITLE_STRING: "제목은 문자열이어야 합니다.",
  TITLE_REQUIRED: "제목을 입력해 주세요.",
  TITLE_MAX: `제목은 ${String(RESIDENCE_REVIEW_TITLE_LENGTH.MAX)}자 이하여야 합니다.`,
  CONTENT_STRING: "내용은 문자열이어야 합니다.",
  CONTENT_REQUIRED: "내용을 입력해 주세요.",
  CONTENT_MAX: `내용은 ${String(RESIDENCE_REVIEW_CONTENT_LENGTH.MAX)}자 이하여야 합니다.`,
  RATING_NUMBER: "평점은 숫자여야 합니다.",
  RATING_INT: "평점은 정수여야 합니다.",
  RATING_MIN: `평점은 최소 ${String(RESIDENCE_REVIEW_RATING.MIN)}점 이상이어야 합니다.`,
  RATING_MAX: `평점은 최대 ${String(RESIDENCE_REVIEW_RATING.MAX)}점까지 입력할 수 있습니다.`,
  REGION_ID_NUMBER: "올바른 지역 ID가 아닙니다.",
  REGION_ID_INT: "올바른 지역 ID가 아닙니다.",
  REGION_ID_POSITIVE: "올바른 지역 ID가 아닙니다.",
  REVIEW_ID_NUMBER: "올바른 거주후기 ID가 아닙니다.",
  REVIEW_ID_INT: "올바른 거주후기 ID가 아닙니다.",
  REVIEW_ID_POSITIVE: "올바른 거주후기 ID가 아닙니다.",
  PAGE_NUMBER: "페이지 번호는 숫자여야 합니다.",
  PAGE_INT: "페이지 번호는 정수여야 합니다.",
  PAGE_POSITIVE: "페이지 번호는 1 이상이어야 합니다.",
  PAGE_MAX: `페이지 번호는 ${String(RESIDENCE_REVIEW_LIST_QUERY.MAX_PAGE)} 이하여야 합니다.`,
  LIMIT_NUMBER: "조회 개수는 숫자여야 합니다.",
  LIMIT_INT: "조회 개수는 정수여야 합니다.",
  LIMIT_POSITIVE: "조회 개수는 1 이상이어야 합니다.",
  LIMIT_MAX: `조회 개수는 ${String(RESIDENCE_REVIEW_LIST_QUERY.MAX_LIMIT)} 이하여야 합니다.`,
  CURSOR_EMPTY: "커서는 비어 있을 수 없습니다.",
  CURSOR_MAX: `커서는 최대 ${String(RESIDENCE_REVIEW_LIST_QUERY.MAX_CURSOR_LENGTH)}자까지 입력할 수 있습니다.`,
  KEYWORD_STRING: "검색어는 문자열이어야 합니다.",
  KEYWORD_MAX: `검색어는 ${String(RESIDENCE_REVIEW_LIST_QUERY.MAX_KEYWORD_LENGTH)}자 이하여야 합니다.`,
  SORT_INVALID: "올바른 정렬 기준이 아닙니다.",
  UPDATE_EMPTY: "수정할 내용을 입력해 주세요.",
} as const;

const regionIdSchema = z
  .number({ error: VALIDATION_MESSAGE.REGION_ID_NUMBER })
  .int(VALIDATION_MESSAGE.REGION_ID_INT)
  .positive(VALIDATION_MESSAGE.REGION_ID_POSITIVE);

const ratingSchema = z
  .number({ error: VALIDATION_MESSAGE.RATING_NUMBER })
  .int(VALIDATION_MESSAGE.RATING_INT)
  .min(RESIDENCE_REVIEW_RATING.MIN, VALIDATION_MESSAGE.RATING_MIN)
  .max(RESIDENCE_REVIEW_RATING.MAX, VALIDATION_MESSAGE.RATING_MAX);

const titleSchema = z
  .string({ error: VALIDATION_MESSAGE.TITLE_STRING })
  .trim()
  .min(RESIDENCE_REVIEW_TITLE_LENGTH.MIN, VALIDATION_MESSAGE.TITLE_REQUIRED)
  .max(RESIDENCE_REVIEW_TITLE_LENGTH.MAX, VALIDATION_MESSAGE.TITLE_MAX);

const contentSchema = z
  .string({ error: VALIDATION_MESSAGE.CONTENT_STRING })
  .trim()
  .min(RESIDENCE_REVIEW_CONTENT_LENGTH.MIN, VALIDATION_MESSAGE.CONTENT_REQUIRED)
  .max(RESIDENCE_REVIEW_CONTENT_LENGTH.MAX, VALIDATION_MESSAGE.CONTENT_MAX);

const pageSchema = z.coerce
  .number({ error: VALIDATION_MESSAGE.PAGE_NUMBER })
  .int(VALIDATION_MESSAGE.PAGE_INT)
  .positive(VALIDATION_MESSAGE.PAGE_POSITIVE)
  .max(RESIDENCE_REVIEW_LIST_QUERY.MAX_PAGE, VALIDATION_MESSAGE.PAGE_MAX)
  .default(RESIDENCE_REVIEW_LIST_QUERY.DEFAULT_PAGE);

const limitSchema = z.coerce
  .number({ error: VALIDATION_MESSAGE.LIMIT_NUMBER })
  .int(VALIDATION_MESSAGE.LIMIT_INT)
  .positive(VALIDATION_MESSAGE.LIMIT_POSITIVE)
  .max(RESIDENCE_REVIEW_LIST_QUERY.MAX_LIMIT, VALIDATION_MESSAGE.LIMIT_MAX)
  .default(RESIDENCE_REVIEW_LIST_QUERY.DEFAULT_LIMIT);

export const createResidenceReviewSchema = z.object({
  regionId: regionIdSchema,
  title: titleSchema,
  content: contentSchema,
  rating: ratingSchema,
});

export const updateResidenceReviewSchema = z
  .object({
    title: titleSchema.optional(),
    content: contentSchema.optional(),
    rating: ratingSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: VALIDATION_MESSAGE.UPDATE_EMPTY,
  });

export const residenceReviewIdParamSchema = z.object({
  residenceReviewId: z.coerce
    .number({ error: VALIDATION_MESSAGE.REVIEW_ID_NUMBER })
    .int(VALIDATION_MESSAGE.REVIEW_ID_INT)
    .positive(VALIDATION_MESSAGE.REVIEW_ID_POSITIVE),
});

export const regionIdParamSchema = z.object({
  regionId: z.coerce
    .number({ error: VALIDATION_MESSAGE.REGION_ID_NUMBER })
    .int(VALIDATION_MESSAGE.REGION_ID_INT)
    .positive(VALIDATION_MESSAGE.REGION_ID_POSITIVE),
});

export const listResidenceReviewQuerySchema = z.object({
  keyword: z
    .string({ error: VALIDATION_MESSAGE.KEYWORD_STRING })
    .trim()
    .max(RESIDENCE_REVIEW_LIST_QUERY.MAX_KEYWORD_LENGTH, VALIDATION_MESSAGE.KEYWORD_MAX)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  regionId: z.coerce
    .number({ error: VALIDATION_MESSAGE.REGION_ID_NUMBER })
    .int(VALIDATION_MESSAGE.REGION_ID_INT)
    .positive(VALIDATION_MESSAGE.REGION_ID_POSITIVE)
    .optional(),
  rating: z.coerce
    .number({ error: VALIDATION_MESSAGE.RATING_NUMBER })
    .int(VALIDATION_MESSAGE.RATING_INT)
    .min(RESIDENCE_REVIEW_RATING.MIN, VALIDATION_MESSAGE.RATING_MIN)
    .max(RESIDENCE_REVIEW_RATING.MAX, VALIDATION_MESSAGE.RATING_MAX)
    .optional(),
  sort: z
    .enum(
      [
        RESIDENCE_REVIEW_LIST_SORT.CREATED_AT,
        RESIDENCE_REVIEW_LIST_SORT.CREATED_AT_ASC,
        RESIDENCE_REVIEW_LIST_SORT.RATING,
      ],
      {
        error: VALIDATION_MESSAGE.SORT_INVALID,
      },
    )
    .default(RESIDENCE_REVIEW_LIST_SORT.CREATED_AT),
  cursor: z
    .string()
    .min(1, VALIDATION_MESSAGE.CURSOR_EMPTY)
    .max(RESIDENCE_REVIEW_LIST_QUERY.MAX_CURSOR_LENGTH, VALIDATION_MESSAGE.CURSOR_MAX)
    .optional(),
  limit: limitSchema,
});

export const listMyResidenceReviewQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});
