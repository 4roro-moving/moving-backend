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
        "- 프론트엔드는 주소 선택 직후 `POST /api/price-predictions/distance`로 실제 이동 거리를 조회한 뒤, 그 값을 이 요청에 전달합니다.",
        "- 거리 조회와 예상 견적을 분리해 카카오 길찾기 오류를 먼저 안내하고, 이동 거리 확인만으로 Gemini 요청을 발생시키지 않습니다.",
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
        500: "예상 견적 계산 중 서버 오류",
        502: "외부 Embedding API 처리 중 오류",
      },
    },
    "POST /distance": {
      summary: "이사 경로 이동 거리 조회",
      description: [
        "출발지와 도착지 좌표를 기준으로 실제 자동차 이동 거리를 조회합니다.",
        "",
        "- 카카오모빌리티 자동차 길찾기 API를 사용합니다.",
        "- 주소 선택 직후 호출해 사용자가 예상 견적 요청 전에 실제 이동 거리를 확인할 수 있도록 별도 endpoint로 제공합니다.",
        "- `origin`과 `destination`에는 위도(latitude), 경도(longitude)를 전달합니다.",
        "- 외부 API 호출 시 카카오 API 규격에 맞춰 경도,위도 순서로 변환합니다.",
        "- 반환된 미터 단위 이동 거리를 km 단위로 변환해 예상 견적 계산에 사용합니다.",
        "- 프론트엔드는 주소 검색 결과의 좌표를 전달하며 사용자가 이동 거리를 직접 입력하지 않습니다.",
      ].join("\n"),
      responses: {
        200: "이동 거리 조회 성공",
        400: "출발지 또는 도착지 좌표가 올바르지 않거나 차량 이동 경로를 찾을 수 없음",
        500: "이동 거리 계산 중 서버 오류",
        502: "카카오모빌리티 길찾기 API 처리 중 오류",
      },
    },
  },
});
