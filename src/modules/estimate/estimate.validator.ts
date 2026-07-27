import { z } from "zod";

/* 
2026.07.21 add 윤소정

Query parameter 검사
ex. GET /api/estimates/requests?limit=10&isDesignated=true&moveType=SMALL
*/

/* 
2026.07.23 add 김성현
- 받은 견적 목록 요청값 검증
- 받은 견적 상세 요청값 검증
- 받은 견적 확정 요청값 검증
*/

//Boolean 문자열 변환
function parseBoolean(value: unknown) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}

//값을 배열로 변환 - 이사 유형(small, home, office)
function makeArray(value: unknown) {
  if (value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [value];
}

const booleanSchema = z.preprocess(parseBoolean, z.boolean());

//값을 배열로 만들고, enum중 하나인지 확인
const moveTypeSchema = z.preprocess(
  makeArray,
  z
    .array(z.enum(["SMALL", "HOME", "OFFICE"]))
    .min(1)
    .max(3),
);

// =============================================================================
// 기사: 고객의 견적 요청 목록 조회
// =============================================================================

//전체 쿼리 검증
export const moverEstimateRequestListQuerySchema = z.object({
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
  keyword: z.string().trim().min(1).max(50).optional(),
  moveType: moveTypeSchema.optional(),
  isDesignated: booleanSchema.optional(), //지정 견적 요청 여부
  isServiceArea: booleanSchema.optional(), //서비스 가능 지역 일치하는지 확인
  sort: z.enum(["moveDate", "requestedAt"]).default("requestedAt"),
});

// 견적 제안 estimateRequestID 검증
export const sendEstimateParamSchema = z.object({
  estimateRequestId: z.coerce.number().int().positive("올바른 견적 요청 ID가 아닙니다."),
});

// 견적 제안 Body 검증
export const sendEstimateBodySchema = z.object({
  price: z
    .number()
    .int("견적가는 정수로 입력해 주세요.")
    .positive("견적가는 0원보다 커야 합니다.")
    .max(100_000_000, "견적가는 1억 원 이하로 입력해 주세요."),
  comment: z
    .string()
    .trim()
    .min(10, "코멘트는 최소 10자 이상 입력해 주세요.")
    .max(1000, "코멘트는 최대 1000자까지 입력할 수 있습니다."),
});

// =============================================================================
// 고객: 기사에게 받은 견적 목록·상세 조회 및 견적 확정
// =============================================================================

// 2026.07.27 add 김성현
// 대기 중인 견적 요청 목록 쿼리 검증
export const pendingEstimateQuerySchema = z.object({
  page: z.coerce
    .number("페이지는 숫자여야 합니다.")
    .int("페이지는 정수여야 합니다.")
    .positive("페이지는 1 이상이어야 합니다.")
    .max(1000, "페이지는 최대 1000까지 조회할 수 있습니다.")
    .default(1),
  limit: z.coerce
    .number("조회 개수는 숫자여야 합니다.")
    .int("조회 개수는 정수여야 합니다.")
    .positive("조회 개수는 1 이상이어야 합니다.")
    .max(50, "조회 개수는 최대 50개까지 가능합니다.")
    .default(10),
});

// 받은 견적 목록 path parameter 검증
export const receivedEstimateRequestIdParamSchema = z.object({
  estimateRequestId: z.coerce.number().int().positive(),
});

// 받은 견적 상세 path parameter 검증
export const receivedEstimateDetailParamSchema = receivedEstimateRequestIdParamSchema.extend({
  estimateId: z.coerce.number().int().positive(),
});

// 받은 견적 확정 path parameter 검증
export const confirmReceivedEstimateParamSchema = receivedEstimateDetailParamSchema;

// 2026.07.24 정슬기 - [수정] 원격 변경사항과 견적 API 작업 충돌 병합
// estimateId 기준 상세·확정 path parameter 검증
export const receivedEstimateIdParamSchema = z.object({
  estimateId: z.coerce.number().int().positive(),
});
