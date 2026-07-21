import { z } from "zod";

/**
 * 카카오(다음) 우편번호 서비스 결과를 그대로 담는 주소 객체.
 *
 * regionId 는 클라이언트가 보내지 않습니다.
 * 서버가 sido 를 regions.name 으로 매핑해 결정합니다.
 */
const addressSchema = z.object({
  zipCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "우편번호는 5자리 숫자여야 합니다."),
  address: z.string().trim().min(1, "주소를 입력해 주세요.").max(255),
  detailAddress: z.string().trim().max(255).optional(),
  sido: z.string().trim().min(1, "시/도 정보가 필요합니다.").max(30),
  sigungu: z.string().trim().max(50).optional(),
});

const moveDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "이사 예정일은 YYYY-MM-DD 형식이어야 합니다.")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), {
    message: "존재하지 않는 날짜입니다.",
  });

export const createEstimateRequestSchema = z.object({
  moveType: z.enum(["SMALL", "HOME", "OFFICE"], {
    message: "이사 유형을 선택해 주세요.",
  }),
  moveDate: moveDateSchema,
  from: addressSchema,
  to: addressSchema,
});

export const updateEstimateRequestSchema = z
  .object({
    moveType: z.enum(["SMALL", "HOME", "OFFICE"]).optional(),
    moveDate: moveDateSchema.optional(),
    from: addressSchema.optional(),
    to: addressSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "수정할 내용을 입력해 주세요.",
  });

export const estimateRequestIdParamSchema = z.object({
  estimateRequestId: z.coerce.number().int().positive("올바른 견적 요청 ID가 아닙니다."),
});

export const designateMoverSchema = z.object({
  moverId: z.uuid("올바른 기사님 ID가 아닙니다."),
});

export const listEstimateRequestQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});
