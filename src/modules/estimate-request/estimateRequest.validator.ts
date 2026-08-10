import { EstimateRequestStatus } from "@prisma/client";
import { z } from "zod";

// 페이지 번호 상한
const MAX_PAGE = 10000;

/**
 * 카카오(다음) 우편번호 서비스 결과를 그대로 담는 주소 객체.
 * 서버가 sido 를 regions.name 으로 매핑해 결정
 */
const addressSchema = z.object({
  zipCode: z
    .string({ error: "우편번호는 문자열이어야 합니다." })
    .trim()
    .regex(/^\d{5}$/, "우편번호는 5자리 숫자여야 합니다.")
    .or(z.literal(""))
    .optional(),
  address: z
    .string({ error: "주소는 문자열이어야 합니다." })
    .trim()
    .min(1, "주소를 입력해 주세요.")
    .max(255, "주소는 255자 이하여야 합니다."),
  detailAddress: z
    .string({ error: "상세 주소는 문자열이어야 합니다." })
    .trim()
    .max(255, "상세 주소는 255자 이하여야 합니다.")
    .optional(),
  sido: z
    .string({ error: "시/도 정보는 문자열이어야 합니다." })
    .trim()
    .min(1, "시/도 정보가 필요합니다.")
    .max(30, "시/도는 30자 이하여야 합니다."),
  sigungu: z
    .string({ error: "시/군/구는 문자열이어야 합니다." })
    .trim()
    .max(50, "시/군/구는 50자 이하여야 합니다.")
    .optional(),
});

const moveDateSchema = z
  .string({ error: "이사 예정일은 문자열이어야 합니다." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "이사 예정일은 YYYY-MM-DD 형식이어야 합니다.")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), {
    message: "존재하지 않는 날짜입니다.",
  });

export const createEstimateRequestSchema = z.object({
  moveType: z.enum(["SMALL", "HOME", "OFFICE"], {
    error: "이사 유형을 선택해 주세요.",
  }),
  moveDate: moveDateSchema,
  from: addressSchema,
  to: addressSchema,
});

export const updateEstimateRequestSchema = z
  .object({
    moveType: z
      .enum(["SMALL", "HOME", "OFFICE"], {
        error: "이사 유형을 선택해 주세요.",
      })
      .optional(),
    moveDate: moveDateSchema.optional(),
    from: addressSchema.optional(),
    to: addressSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "수정할 내용을 입력해 주세요.",
  });

export const estimateRequestIdParamSchema = z.object({
  estimateRequestId: z.coerce
    .number()
    .int("올바른 견적 요청 ID가 아닙니다.")
    .positive("올바른 견적 요청 ID가 아닙니다."),
});

export const designateMoverSchema = z.object({
  moverId: z.uuid("올바른 기사님 ID가 아닙니다."),
});

export const cancelDesignatedMoverParamSchema = z.object({
  estimateRequestId: z.coerce
    .number()
    .int("올바른 견적 요청 ID가 아닙니다.")
    .positive("올바른 견적 요청 ID가 아닙니다."),
  moverId: z.uuid("올바른 기사님 ID가 아닙니다."),
});

export const listEstimateRequestQuerySchema = z.object({
  page: z.coerce
    .number({ error: "페이지 번호는 숫자여야 합니다." })
    .int("페이지 번호는 정수여야 합니다.")
    .positive("페이지 번호는 1 이상이어야 합니다.")
    .max(MAX_PAGE, `페이지 번호는 ${String(MAX_PAGE)} 이하여야 합니다.`)
    .default(1),
  limit: z.coerce
    .number({ error: "조회 개수는 숫자여야 합니다." })
    .int("조회 개수는 정수여야 합니다.")
    .positive("조회 개수는 1 이상이어야 합니다.")
    .max(50, "조회 개수는 50 이하여야 합니다.")
    .default(10),
  // 선택값 — 미전달 시 전체 조회. 허용값은 Prisma EstimateRequestStatus
  // 2026.07.30 정슬기 - [수정] 문자열 하드코딩 → Prisma enum (프로필 MoveType 패턴과 동일)
  status: z
    .enum(EstimateRequestStatus, {
      error: "올바른 견적 요청 상태가 아닙니다.",
    })
    .optional(),
});
