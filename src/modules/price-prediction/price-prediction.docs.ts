import { registerRouterDocs } from "../../config/openapi-router";
import { pricePredictionRouter } from "./price-prediction.route";

registerRouterDocs(pricePredictionRouter, {
  basePath: "/api/price-predictions",
  tag: "Price Prediction",
  endpoints: {
    "POST /": {
      summary: "AI 예상 견적 조회",
      description: [
        "공개 이사 시세를 기준으로 생성한 합성 견적 데이터에서 입력 조건과 유사한 사례를 검색해 예상 견적을 계산합니다.",
        "",
        "- `moveType`은 MOVING의 이사 유형(SMALL, HOME, OFFICE) 중 하나입니다.",
        "- `distanceKm`는 출발지와 도착지 사이의 이동 거리(km)입니다.",
        "- `loadAmount`는 짐량(LOW, MEDIUM, HIGH)입니다.",
        "- `moveDate`를 기준으로 주말 여부와 성수기 여부를 서버에서 계산합니다.",
        "- 이사 유형, 짐량, 평수, 이동 거리를 정형 조건으로 먼저 필터링합니다.",
        "- 이후 Gemini Embedding과 PostgreSQL pgvector를 이용해 유사 견적 후보를 검색합니다.",
        "- 검색 후보에는 Vector Similarity와 지역·평수·거리 조건을 결합한 Hybrid Ranking을 적용합니다.",
        "- 최종 예상 견적은 상위 유사 사례의 P25 / Median / P75 가격 분포를 기반으로 산출합니다.",
        "- 현재 데이터셋은 실제 고객 거래 데이터가 아니라 공개 시세를 기준으로 생성한 합성(synthetic) 데이터입니다.",
        "- 서비스 운영 이후 실제 기사 견적 데이터가 충분히 축적되면 실제 견적 데이터를 반영해 고도화할 수 있습니다.",
      ].join("\n"),
      responses: {
        200: "예상 견적 조회 성공",
        400: "요청 값이 올바르지 않거나 유사 견적 데이터가 충분하지 않음",
        500: "예상 견적 계산 또는 외부 Embedding API 처리 중 서버 오류",
      },
    },
  },
});
