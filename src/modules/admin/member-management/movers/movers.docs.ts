import { z } from "zod";

import { registerRouterDocs } from "../../../../config/openapi-router";
import adminMoverRouter from "./movers.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(adminMoverRouter, {
  basePath: "/api/admin/movers",
  tag: "Mover (Admin)",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "기사님 목록 조회",
      description: [
        "관리자가 기사님(MOVER) 목록을 검색·필터링·페이지네이션하여 조회합니다.",
        "응답에는 계정 휴대폰 번호를 포함합니다.",
        "",
        "- `keyword`: 이름·닉네임·이메일 부분일치(대소문자 무시)",
        "- `status`: ACTIVE | SUSPENDED | WITHDRAWN (미지정 시 탈퇴 회원 제외)",
        "- `isProfileCompleted`: 프로필 완료 여부 (`true` | `false`)",
        "- `regionId` / `moveType`: 서비스 가능 지역·제공 이사 유형 필터",
        "- `fromDate` / `toDate`: 가입일 기간 검색 (YYYY-MM-DD, KST 기준)",
        "- `reportSort`: PENDING_DESC(미처리 피신고 많은 순) | PENDING_ASC(적은 순)",
        "- `confirmedSort`: CONFIRMED_DESC(확정 건수 많은 순) | CONFIRMED_ASC(적은 순)",
        "- `sort`: LATEST(기본값, 최신 가입순) | OLDEST(오래된 가입순)",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },
    "GET /{id}": {
      summary: "기사님 상세 조회",
      description: [
        "관리자가 기사님(MOVER)의 계정·프로필과 주요 활동 이력을 조회합니다.",
        "진행 중 견적은 전송(SENT)·확정(CONFIRMED) 상태, 최근 견적은 만료·취소 또는 이사 완료 거래의 최신 5건을 제공합니다.",
        "Customer ID 또는 존재하지 않는 ID는 MOVER_NOT_FOUND를 반환합니다.",
      ].join("\n"),
      responses: { 200: "조회 성공", 404: "기사를 찾을 수 없습니다." },
    },
  },
});
