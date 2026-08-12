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
        "",
        "- `keyword`: 이름·닉네임·이메일 부분일치(대소문자 무시)",
        "- `status`: ACTIVE | SUSPENDED | WITHDRAWN (미지정 시 탈퇴 회원 제외)",
        "- `isProfileCompleted`: 프로필 완료 여부 (`true` | `false`)",
        "- `regionId` / `moveType`: 서비스 가능 지역·제공 이사 유형 필터",
        "- `fromDate` / `toDate`: 가입일 기간 검색 (YYYY-MM-DD, KST 기준)",
        "- 정렬: createdAt DESC (최신 가입순)",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },
  },
});
