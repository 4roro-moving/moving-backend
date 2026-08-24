import { registerRouterDocs } from "../../config/openapi-router";
import moverRouter from "./mover.route";

registerRouterDocs(moverRouter, {
  basePath: "/api/movers",
  tag: "Mover",
  commonResponses: {
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "기사 목록 조회",
      description:
        "키워드, 서비스 지역, 이사 유형으로 필터링하고 리뷰 수·평점·경력·확정 견적 수 기준으로 정렬합니다. 인증한 고객은 각 기사에 대한 찜 여부도 확인할 수 있습니다.",
      responses: { 200: "조회 성공" },
    },
    "GET /:moverId": {
      summary: "기사 상세 조회",
      description:
        "기사 프로필, 서비스 지역, 평점 분포를 조회합니다. 인증한 고객은 해당 기사의 찜 여부도 확인할 수 있습니다.",
      responses: { 200: "조회 성공", 404: "기사를 찾을 수 없습니다." },
    },
    "GET /:moverId/reviews": {
      summary: "기사 리뷰 목록 조회",
      description: "특정 기사에게 작성된 리뷰를 페이지네이션하여 조회합니다.",
      responses: { 200: "조회 성공", 404: "기사를 찾을 수 없습니다." },
    },
  },
});
