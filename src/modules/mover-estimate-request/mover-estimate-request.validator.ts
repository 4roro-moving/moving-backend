import { z } from "zod";

/* 
2026.07.21 add 윤소정

Query parameter 검사
ex. GET /api/movers/estimate-requests?limit=10&isDesignated=true&moveType=SMALL
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
