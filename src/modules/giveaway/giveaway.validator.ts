import { z } from "zod";

import {
  giveawayCreateImageKeysSchema,
  giveawayUpdateImageKeysSchema,
} from "./giveaway-image.validator";
import {
  GIVEAWAY_PAGINATION,
  GIVEAWAY_REQUEST_STATUS,
  GIVEAWAY_STATUS,
  GIVEAWAY_TEXT_LENGTH,
} from "./giveaway.type";

const titleSchema = z
  .string({ error: "제목은 문자열이어야 합니다." })
  .trim()
  .min(GIVEAWAY_TEXT_LENGTH.TITLE_MIN, "제목을 입력해 주세요.")
  .max(
    GIVEAWAY_TEXT_LENGTH.TITLE_MAX,
    `제목은 ${String(GIVEAWAY_TEXT_LENGTH.TITLE_MAX)}자 이하여야 합니다.`,
  );

const descriptionSchema = z
  .string({ error: "설명은 문자열이어야 합니다." })
  .trim()
  .min(GIVEAWAY_TEXT_LENGTH.DESCRIPTION_MIN, "설명을 입력해 주세요.")
  .max(
    GIVEAWAY_TEXT_LENGTH.DESCRIPTION_MAX,
    `설명은 ${String(GIVEAWAY_TEXT_LENGTH.DESCRIPTION_MAX)}자 이하여야 합니다.`,
  );

const regionIdSchema = z
  .number({ error: "지역 ID는 숫자여야 합니다." })
  .int("지역 ID는 정수여야 합니다.")
  .positive("올바른 지역 ID가 아닙니다.");

const messageSchema = z
  .string({ error: "신청 메시지는 문자열이어야 합니다." })
  .trim()
  .max(
    GIVEAWAY_TEXT_LENGTH.MESSAGE_MAX,
    `신청 메시지는 ${String(GIVEAWAY_TEXT_LENGTH.MESSAGE_MAX)}자 이하여야 합니다.`,
  );

const pageSchema = z.coerce
  .number({ error: "페이지 번호는 숫자여야 합니다." })
  .int("페이지 번호는 정수여야 합니다.")
  .positive("페이지 번호는 1 이상이어야 합니다.")
  .max(
    GIVEAWAY_PAGINATION.MAX_PAGE,
    `페이지 번호는 ${String(GIVEAWAY_PAGINATION.MAX_PAGE)} 이하여야 합니다.`,
  )
  .default(GIVEAWAY_PAGINATION.DEFAULT_PAGE);

const limitSchema = z.coerce
  .number({ error: "조회 개수는 숫자여야 합니다." })
  .int("조회 개수는 정수여야 합니다.")
  .positive("조회 개수는 1 이상이어야 합니다.")
  .max(
    GIVEAWAY_PAGINATION.MAX_LIMIT,
    `조회 개수는 ${String(GIVEAWAY_PAGINATION.MAX_LIMIT)} 이하여야 합니다.`,
  )
  .default(GIVEAWAY_PAGINATION.DEFAULT_LIMIT);

export const giveawayIdParamSchema = z.object({
  giveawayId: z.coerce
    .number({ error: "올바른 나눔 ID가 아닙니다." })
    .int("올바른 나눔 ID가 아닙니다.")
    .positive("올바른 나눔 ID가 아닙니다."),
});

export const completeGiveawayParamSchema = giveawayIdParamSchema;

export const giveawayRequestIdParamSchema = z.object({
  requestId: z.coerce
    .number({ error: "올바른 신청 ID가 아닙니다." })
    .int("올바른 신청 ID가 아닙니다.")
    .positive("올바른 신청 ID가 아닙니다."),
});

export const selectGiveawayRequestParamSchema = giveawayIdParamSchema.extend({
  requestId: giveawayRequestIdParamSchema.shape.requestId,
});

export const rejectGiveawayRequestParamSchema = selectGiveawayRequestParamSchema;

export const cancelGiveawayRequestParamSchema = giveawayRequestIdParamSchema;

export const createGiveawaySchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  regionId: regionIdSchema.optional(),
  imageKeys: giveawayCreateImageKeysSchema.default([]),
});

export const updateGiveawaySchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    regionId: regionIdSchema.nullable().optional(),
    imageKeys: giveawayUpdateImageKeysSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "수정할 내용을 입력해 주세요.",
  });

export const listGiveawayQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  status: z
    .enum([GIVEAWAY_STATUS.AVAILABLE, GIVEAWAY_STATUS.IN_PROGRESS, GIVEAWAY_STATUS.COMPLETED], {
      error: "올바른 나눔 상태가 아닙니다.",
    })
    .optional(),
  regionId: z.coerce
    .number({ error: "지역 ID는 숫자여야 합니다." })
    .int("지역 ID는 정수여야 합니다.")
    .positive("올바른 지역 ID가 아닙니다.")
    .optional(),
});

export const listMyGiveawayQuerySchema = listGiveawayQuerySchema;

export const createGiveawayRequestSchema = z.object({
  message: messageSchema.optional(),
});

export const updateGiveawayRequestSchema = z.object({
  message: messageSchema.nullable(),
});

export const listGiveawayRequestQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  status: z
    .enum(
      [
        GIVEAWAY_REQUEST_STATUS.PENDING,
        GIVEAWAY_REQUEST_STATUS.SELECTED,
        GIVEAWAY_REQUEST_STATUS.REJECTED,
        GIVEAWAY_REQUEST_STATUS.CANCELLED,
      ],
      { error: "올바른 신청 상태가 아닙니다." },
    )
    .optional(),
});
