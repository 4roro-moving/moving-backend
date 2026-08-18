import { z } from "zod";

import { registerRouterDocs } from "../../../config/openapi-router";
import adminEstimateRouter from "./estimates.route";

registerRouterDocs(adminEstimateRouter, {
  basePath: "/api/admin/estimates",
  tag: "Estimate (Admin)",
  headers: z.object({ authorization: z.string().meta({ example: "Bearer <access-token>" }) }),
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "활성 관리자 권한이 필요합니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "PATCH /:estimateId/cancel": {
      summary: "확정 견적 관리자 수동 취소",
      description: [
        "관리자가 확정된 거래를 수동으로 취소합니다.",
        "",
        "- 대상 견적과 견적 요청이 모두 `CONFIRMED`이고, 해당 견적이 요청의 `confirmedEstimateId`인 경우에만 취소합니다.",
        "- 견적 요청·확정 견적·대기 중 견적 수정 요청을 취소하고, 이력·ActivityLog·채팅 SYSTEM 메시지·고객/기사 알림을 생성합니다.",
      ].join("\n"),
      responses: {
        200: "취소 성공",
        404: "견적을 찾을 수 없습니다.",
        409: "ADMIN_ESTIMATE_CANCEL_NOT_ALLOWED - 확정 거래가 아니거나 이미 종료된 거래입니다.",
      },
    },
  },
});
