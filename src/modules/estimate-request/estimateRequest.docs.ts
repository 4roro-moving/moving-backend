import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";
import estimateRequestRouter from "./estimateRequest.route";

/**
 * auth 모듈 완성 전까지 사용하는 개발용 인증 헤더입니다.
 * JWT 적용 후에는 bearerAuth 시큐리티 스키마로 교체합니다.
 */
const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(estimateRequestRouter, {
  basePath: "/api/estimate-requests",
  tag: "EstimateRequest",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "권한이 없거나 본인의 견적 요청이 아닙니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "POST /": {
      summary: "견적 요청 생성",
      description: [
        "이사 유형, 예정일, 출발지/도착지를 입력받아 견적 요청을 생성합니다.",
        "",
        "- `regionId` 는 클라이언트가 보내지 않습니다. 서버가 `sido` 를 `regions.name` 으로 매핑합니다.",
        "- 주소는 카카오(다음) 우편번호 서비스 결과를 그대로 전달하면 됩니다.",
        "- 생성 즉시 `OPEN` 상태가 되며, 조건에 맞는 기사님들에게 알림이 발송됩니다.",
        "- 고객당 진행 중인 견적 요청은 1건으로 제한됩니다.",
        "- 이사 예정일은 KST 기준 오늘부터 선택할 수 있습니다.",
      ].join("\n"),
      responses: {
        201: "생성 성공",
        400: "이사 예정일이 과거이거나 지원하지 않는 지역입니다.",
        409: "이미 진행 중인 견적 요청이 있습니다.",
      },
    },

    "GET /": {
      summary: "내 견적 요청 목록",
      description: "최신순으로 정렬되며 `pagination` 이 함께 반환됩니다.",
      responses: { 200: "조회 성공" },
    },

    "GET /active": {
      summary: "진행 중인 견적 요청 조회",
      description: "진행 중인 요청이 없으면 `data` 가 `null` 로 반환됩니다.",
      responses: { 200: "조회 성공 (없으면 data: null)" },
    },

    "GET /:estimateRequestId": {
      summary: "견적 요청 상세",
      responses: {
        200: "조회 성공",
        404: "견적 요청을 찾을 수 없습니다.",
      },
    },

    "GET /:estimateRequestId/estimates/:estimateId": {
      summary: "받은 견적 상세",
      description: "고객이 본인의 견적 요청에 도착한 특정 견적을 상세 조회합니다.",
      responses: {
        200: "조회 성공",
        403: "본인의 견적 요청에 도착한 견적이 아닙니다.",
        404: "견적을 찾을 수 없습니다.",
      },
    },

    "PATCH /:estimateRequestId/estimates/:estimateId/confirm": {
      summary: "받은 견적 확정",
      description: [
        "고객이 본인의 견적 요청에 도착한 특정 견적을 확정합니다.",
        "",
        "- 선택한 견적은 `CONFIRMED` 상태가 됩니다.",
        "- 같은 견적 요청의 다른 `SENT` 견적은 `EXPIRED` 상태가 됩니다.",
        "- 견적 요청은 `CONFIRMED` 상태가 되며 `confirmedEstimateId`가 저장됩니다.",
      ].join("\n"),
      responses: {
        200: "확정 성공",
        403: "본인의 견적 요청에 도착한 견적이 아닙니다.",
        404: "견적을 찾을 수 없습니다.",
        409: "이미 확정되었거나 확정할 수 없는 상태입니다.",
      },
    },

    "PATCH /:estimateRequestId": {
      summary: "견적 요청 수정",
      description: "견적이 1건이라도 도착하면 수정할 수 없습니다.",
      responses: {
        200: "수정 성공",
        400: "이사 예정일이 과거이거나 지원하지 않는 지역입니다.",
        404: "견적 요청을 찾을 수 없습니다.",
        409: "견적이 도착했거나 수정할 수 없는 상태입니다.",
      },
    },

    "DELETE /:estimateRequestId": {
      summary: "견적 요청 취소",
      responses: {
        200: "취소 성공",
        404: "견적 요청을 찾을 수 없습니다.",
        409: "이미 종료된 견적 요청입니다.",
      },
    },

    "POST /:estimateRequestId/designate": {
      summary: "지정 견적 요청",
      description: [
        "특정 기사님을 지정해 견적을 요청합니다.",
        "",
        "- 요청당 최대 3명까지 지정할 수 있습니다.",
        "- 대상은 활성 상태이며 프로필을 완성한 기사님이어야 합니다.",
      ].join("\n"),
      responses: {
        201: "지정 성공",
        404: "견적 요청 또는 기사님을 찾을 수 없습니다.",
        409: "이미 지정했거나 최대 인원을 초과했습니다.",
      },
    },
  },
});
