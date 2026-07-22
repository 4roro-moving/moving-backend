import { MoveType } from "@prisma/client";
import { z } from "zod";

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 20;
const MAX_SERVICE_AREA_COUNT = 2;

const nameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH, {
    error: `이름은 ${NAME_MIN_LENGTH}자 이상이어야 합니다.`,
  })
  .max(NAME_MAX_LENGTH, {
    error: `이름은 ${NAME_MAX_LENGTH}자 이하여야 합니다.`,
  });

const phoneSchema = z
  .string()
  .trim()
  .regex(/^01[016789]\d{7,8}$/, {
    error: "휴대폰 번호는 하이픈 없이 올바른 형식으로 입력해주세요.",
  });

const imageUrlSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.url({
    error: "프로필 이미지 URL 형식이 올바르지 않습니다.",
  }),
);

const regionIdsSchema = z
  .array(
    z
      .number()
      .int({
        error: "지역 ID는 정수여야 합니다.",
      })
      .positive({
        error: "지역 ID는 1 이상의 숫자여야 합니다.",
      }),
  )
  .min(1, {
    error: "서비스 가능 지역을 1개 이상 선택해주세요.",
  })
  .max(MAX_SERVICE_AREA_COUNT, {
    error: `서비스 가능 지역은 최대 ${MAX_SERVICE_AREA_COUNT}개까지 선택할 수 있습니다.`,
  })
  .refine((regionIds) => new Set(regionIds).size === regionIds.length, {
    error: "중복된 지역을 선택할 수 없습니다.",
  });

const serviceTypesSchema = z
  .array(
    z.enum(MoveType, {
      error: "올바른 이사 유형을 선택해주세요.",
    }),
  )
  .min(1, {
    error: "이사 유형을 1개 이상 선택해주세요.",
  })
  .refine((serviceTypes) => new Set(serviceTypes).size === serviceTypes.length, {
    error: "중복된 이사 유형을 선택할 수 없습니다.",
  });

export const createProfileSchema = z.strictObject({
  imageUrl: imageUrlSchema.optional(),
  regionIds: regionIdsSchema,
  serviceTypes: serviceTypesSchema,
});

export const updateProfileSchema = z
  .strictObject({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
    imageUrl: imageUrlSchema.nullable().optional(),
    regionIds: regionIdsSchema.optional(),
    serviceTypes: serviceTypesSchema.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: "수정할 정보를 하나 이상 입력해주세요.",
  });

export type CreateProfileBody = z.infer<typeof createProfileSchema>;
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
