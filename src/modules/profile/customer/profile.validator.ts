import { MoveType } from "@prisma/client";
import { z } from "zod";

const nameSchema = z
  .string()
  .trim()
  .min(1, {
    message: "이름을 입력해주세요.",
  })
  .max(20, {
    message: "이름은 20자 이하로 입력해주세요.",
  });

const phoneSchema = z
  .string()
  .trim()
  .regex(/^01[016789]-?\d{3,4}-?\d{4}$/, {
    message: "올바른 휴대전화 번호 형식이 아닙니다.",
  })
  .transform((phone) => phone.replaceAll("-", ""));

const passwordSchema = z
  .string()
  .min(8, {
    message: "비밀번호는 8자 이상이어야 합니다.",
  })
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "비밀번호는 UTF-8 기준 72바이트 이하로 입력해주세요.",
  });

const imageUrlSchema = z.url({
  message: "올바른 이미지 URL이 아닙니다.",
});

const regionIdsSchema = z
  .array(
    z
      .number()
      .int({
        message: "지역 ID는 정수여야 합니다.",
      })
      .positive({
        message: "지역 ID는 양의 정수여야 합니다.",
      }),
  )
  .min(1, {
    message: "지역을 한 개 이상 선택해주세요.",
  })
  .max(10, {
    message: "지역은 최대 10개까지 선택할 수 있습니다.",
  })
  .refine((regionIds) => new Set(regionIds).size === regionIds.length, {
    message: "중복된 지역을 선택할 수 없습니다.",
  });

const serviceTypesSchema = z
  .array(z.enum(MoveType))
  .min(1, {
    message: "이용 서비스를 한 개 이상 선택해주세요.",
  })
  .refine((serviceTypes) => new Set(serviceTypes).size === serviceTypes.length, {
    message: "중복된 이용 서비스를 선택할 수 없습니다.",
  });

export const createProfileSchema = z.strictObject({
  phone: phoneSchema.optional(),
  imageUrl: imageUrlSchema.optional(),
  regionIds: regionIdsSchema,
  serviceTypes: serviceTypesSchema,
});

export const updateProfileSchema = z
  .strictObject({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),

    currentPassword: passwordSchema.optional(),
    newPassword: passwordSchema.optional(),
    newPasswordConfirm: passwordSchema.optional(),

    imageUrl: imageUrlSchema.nullable().optional(),
    regionIds: regionIdsSchema.optional(),
    serviceTypes: serviceTypesSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const hasCurrentPassword = data.currentPassword !== undefined;
    const hasNewPassword = data.newPassword !== undefined;
    const hasNewPasswordConfirm = data.newPasswordConfirm !== undefined;

    const isPasswordChangeRequested = hasCurrentPassword || hasNewPassword || hasNewPasswordConfirm;

    if (isPasswordChangeRequested) {
      if (!hasCurrentPassword) {
        ctx.addIssue({
          code: "custom",
          path: ["currentPassword"],
          message: "현재 비밀번호를 입력해주세요.",
        });
      }

      if (!hasNewPassword) {
        ctx.addIssue({
          code: "custom",
          path: ["newPassword"],
          message: "새 비밀번호를 입력해주세요.",
        });
      }

      if (!hasNewPasswordConfirm) {
        ctx.addIssue({
          code: "custom",
          path: ["newPasswordConfirm"],
          message: "새 비밀번호 확인을 입력해주세요.",
        });
      }

      if (hasNewPassword && hasNewPasswordConfirm && data.newPassword !== data.newPasswordConfirm) {
        ctx.addIssue({
          code: "custom",
          path: ["newPasswordConfirm"],
          message: "새 비밀번호가 일치하지 않습니다.",
        });
      }

      if (hasCurrentPassword && hasNewPassword && data.currentPassword === data.newPassword) {
        ctx.addIssue({
          code: "custom",
          path: ["newPassword"],
          message: "새 비밀번호는 현재 비밀번호와 달라야 합니다.",
        });
      }
    }

    const hasUpdateField =
      data.name !== undefined ||
      data.phone !== undefined ||
      data.imageUrl !== undefined ||
      data.regionIds !== undefined ||
      data.serviceTypes !== undefined ||
      isPasswordChangeRequested;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "수정할 정보를 한 개 이상 입력해주세요.",
      });
    }
  });
