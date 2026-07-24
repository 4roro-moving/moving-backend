import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";
import estimateRouter from "./estimate.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

// 2026.07.24 정슬기 - [추가] 받은 견적 목록·상세·확정 API OpenAPI 문서 등록
registerRouterDocs(estimateRouter, {
  basePath: "/api/estimates",
  tag: "Estimate",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "권한이 없거나 본인의 견적이 아닙니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /received": {
      summary: "받은 견적 패널 목록",
      description:
        "고객의 견적 요청 중 받은 견적이 있는 요청을 패널 단위로 조회합니다. 대기(SENT)/확정(CONFIRMED) 견적이 함께 포함됩니다.",
      responses: {
        200: "조회 성공",
      },
    },

    "GET /requests": {
      summary: "기사님 견적 요청 목록",
      description: "기사님이 응답할 수 있는 견적 요청 목록을 조회합니다.",
      responses: {
        200: "조회 성공",
      },
    },

    "GET /:estimateId": {
      summary: "받은 견적 상세 (estimateId)",
      description:
        "estimateId만으로 고객 본인의 받은 견적 상세를 조회합니다. canConfirm, confirmDisabledReason을 포함합니다.",
      responses: {
        200: "조회 성공",
        404: "견적을 찾을 수 없습니다.",
      },
    },

    "POST /:estimateId/confirm": {
      summary: "견적 확정 (estimateId)",
      description: [
        "estimateId만으로 고객이 받은 견적을 확정합니다.",
        "",
        "- 내부적으로 원격 확정 로직(요청당 1건, 미선택 견적 만료, 이력 저장)을 재사용합니다.",
        "- 이미 확정된 요청이 있으면 409를 반환합니다.",
      ].join("\n"),
      responses: {
        200: "확정 성공",
        404: "견적을 찾을 수 없습니다.",
        409: "이미 확정되었거나 확정할 수 없는 견적입니다.",
      },
    },
  },
});
