import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";
import { moverCalendarRouter } from "./mover-calendar.route";

registerRouterDocs(moverCalendarRouter, {
  basePath: "/api/movers",
  tag: "Mover Calendar",
  headers: z.object({ authorization: z.string().optional() }),
  commonResponses: { 422: "입력값 검증 실패" },
  endpoints: {
    "GET /:moverId/calendar": {
      summary: "기사 월별 일정 조회",
      description:
        "날짜별 AVAILABLE, FULL, OFF 상태를 반환합니다. 기사 본인에게만 확정 예약 요약을 제공합니다.",
      responses: { 200: "조회 성공", 404: "기사를 찾을 수 없음" },
    },
    "PUT /me/calendar/:date": {
      summary: "내 휴무일 등록 또는 해제",
      description:
        "OFF로 휴무를 등록하고 AVAILABLE로 휴무를 해제합니다. FULL은 직접 지정할 수 없습니다.",
      responses: {
        200: "변경 성공",
        401: "인증 필요",
        403: "기사 권한 필요",
        409: "확정 일정 존재",
      },
    },
  },
});
