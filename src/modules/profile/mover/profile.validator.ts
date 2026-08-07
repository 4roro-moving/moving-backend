import { MoveType } from "@prisma/client";
import { z } from "zod";

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: "이름을 입력해주세요." })
  .max(50, { error: "이름은 50자 이하여야 합니다." });

const phoneSchema = z
  .string()
  .trim()
  .regex(/^01[016789]-?\d{3,4}-?\d{4}$/, {
    error: "올바른 휴대전화 번호 형식이 아닙니다.",
  })
  .transform((phone) => phone.replaceAll("-", ""));

const passwordSchema = z
  .string()
  .min(8, {
    error: "비밀번호는 8자 이상이어야 합니다.",
  })
  .max(100, {
    error: "비밀번호는 100자 이하여야 합니다.",
  })
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    error: "비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.",
  });

const nicknameSchema = z
  .string()
  .trim()
  .min(2, { error: "닉네임은 2자 이상이어야 합니다." })
  .max(20, { error: "닉네임은 20자 이하여야 합니다." });

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const profileImageKeySchema = z
  .string()
  .trim()
  .regex(new RegExp(`^profiles/${uuidPattern}/${uuidPattern}\\.(jpg|png|webp)$`, "i"), {
    error: "올바른 프로필 이미지 Key 형식이 아닙니다.",
  });

const careerSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() !== "") {
      return Number(value);
    }

    return value;
  },
  z
    .number({
      error: "경력은 숫자여야 합니다.",
    })
    .int({
      error: "경력은 정수여야 합니다.",
    })
    .min(0, {
      error: "경력은 0 이상이어야 합니다.",
    })
    .max(100, {
      error: "경력은 100 이하여야 합니다.",
    }),
);

const shortIntroSchema = z
  .string()
  .trim()
  .min(1, { error: "한 줄 소개를 입력해주세요." })
  .max(100, {
    error: "한 줄 소개는 100자 이하여야 합니다.",
  });

const descriptionSchema = z
  .string()
  .trim()
  .min(1, { error: "상세 소개를 입력해주세요." })
  .max(1000, {
    error: "상세 소개는 1000자 이하여야 합니다.",
  });

const regionIdsSchema = z
  .array(
    z
      .number({
        error: "지역 ID는 숫자여야 합니다.",
      })
      .int({
        error: "지역 ID는 정수여야 합니다.",
      })
      .positive({
        error: "지역 ID는 1 이상이어야 합니다.",
      }),
  )
  .min(1, {
    error: "서비스 가능 지역을 한 개 이상 선택해주세요.",
  })
  .max(10, {
    error: "서비스 가능 지역은 최대 10개까지 선택할 수 있습니다.",
  })
  .refine((regionIds) => new Set(regionIds).size === regionIds.length, {
    error: "서비스 가능 지역은 중복해서 선택할 수 없습니다.",
  });

const serviceTypesSchema = z
  .array(
    z.enum(MoveType, {
      error: "올바른 이사 유형을 선택해주세요.",
    }),
  )
  .min(1, {
    error: "서비스 유형을 한 개 이상 선택해주세요.",
  })
  .refine((serviceTypes) => new Set(serviceTypes).size === serviceTypes.length, {
    error: "서비스 유형은 중복해서 선택할 수 없습니다.",
  });

export const createProfileSchema = z.strictObject({
  phone: phoneSchema.optional(),

  nickname: nicknameSchema,
  imageUrl: profileImageKeySchema.optional(),
  career: careerSchema,
  shortIntro: shortIntroSchema,
  description: descriptionSchema,
  regionIds: regionIdsSchema,
  serviceTypes: serviceTypesSchema,
});

export const updateBasicInfoSchema = z
  .strictObject({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),

    currentPassword: passwordSchema.optional(),
    newPassword: passwordSchema.optional(),
    newPasswordConfirm: passwordSchema.optional(),
  })
  .superRefine((input, ctx) => {
    const hasBasicInfoUpdate = input.name !== undefined || input.phone !== undefined;

    const isPasswordChangeRequested =
      input.currentPassword !== undefined ||
      input.newPassword !== undefined ||
      input.newPasswordConfirm !== undefined;

    if (!hasBasicInfoUpdate && !isPasswordChangeRequested) {
      ctx.addIssue({
        code: "custom",
        message: "수정할 기본정보를 한 개 이상 입력해주세요.",
      });
    }

    if (
      isPasswordChangeRequested &&
      (input.currentPassword === undefined ||
        input.newPassword === undefined ||
        input.newPasswordConfirm === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요.",
      });
    }

    if (
      input.newPassword !== undefined &&
      input.newPasswordConfirm !== undefined &&
      input.newPassword !== input.newPasswordConfirm
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["newPasswordConfirm"],
        message: "새 비밀번호가 일치하지 않습니다.",
      });
    }

    if (
      input.currentPassword !== undefined &&
      input.newPassword !== undefined &&
      input.currentPassword === input.newPassword
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "새 비밀번호는 현재 비밀번호와 달라야 합니다.",
      });
    }
  });

export const updateProfileSchema = z
  .strictObject({
    nickname: nicknameSchema.optional(),

    imageUrl: profileImageKeySchema.nullable().optional(),

    career: careerSchema.optional(),

    shortIntro: shortIntroSchema.optional(),

    description: descriptionSchema.optional(),

    regionIds: regionIdsSchema.optional(),

    serviceTypes: serviceTypesSchema.optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    error: "수정할 프로필 정보를 한 개 이상 입력해주세요.",
  });
