import { z } from "zod";

import { registerRouterDocs } from "../../../config/openapi-router";

import { adminDashboardRouter } from "./dashboard.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({
    example: "Bearer <access-token>",
  }),
});

registerRouterDocs(adminDashboardRouter, {
  basePath: "/api/admin/dashboard",
  tag: "Dashboard (Admin)",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "관리자 대시보드 요약 조회",
      description: [
        "관리자 메인 화면에 필요한 운영 지표를 한 번에 조회합니다.",
        "",
        "- `period`: 7d | 30d | 90d (기본 7d)",
        "- `period` 는 **기간 지표에만** 적용됩니다.",
        "  - 적용: `service` (견적 요청/개설/확정/이사 완료), `members.newInPeriod`",
        "  - 미적용: `members.totalCount`, `members.activeMoverCount`, `pending`, `contents`",
        "- `contents` 는 관리자가 숨김 처리한 **누적** 건수입니다.",
        "  공지·FAQ 는 `isVisible=false` 를 숨김으로 봅니다.",
        "- `recent.reports` 와 `recent.inquiries` 는 미처리 건을 우선 노출합니다.",
        "  최신순으로만 뽑으면 오래된 미처리 건이 목록 밖으로 밀리기 때문입니다.",
        "- 응답은 60초간 캐시됩니다. 관리자가 여러 명이거나 새로고침을 반복해도",
        "  그 주기 안에서는 동일한 값이 반환됩니다.",
        "- SUPER_ADMIN 은 관리자 계정 관리 전담이라 접근할 수 없습니다.",
      ].join("\n"),
    },
  },
});
