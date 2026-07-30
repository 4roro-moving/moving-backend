import { z } from "zod";

import { registerRouterDocs } from "../../../config/openapi-router";
import { adminFaqRouter, publicFaqRouter } from "./faq.route";

/**
 * 관리자 인증 헤더.
 */
const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

// 관리자 FAQ 문서
registerRouterDocs(adminFaqRouter, {
  basePath: "/api/admin/faqs",
  tag: "FAQ (Admin)",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "POST /": {
      summary: "FAQ 생성",
      description: [
        "관리자가 FAQ를 등록합니다.",
        "",
        "- `sortOrder` 로 노출 순서를 지정합니다. (작을수록 위)",
        "- `isVisible` 이 false 이면 사용자 공개 목록에서 숨겨집니다.",
      ].join("\n"),
      responses: { 201: "생성 성공" },
    },
    "GET /": {
      summary: "FAQ 목록 (관리자)",
      description: [
        "정렬 순서(sortOrder) 오름차순으로 조회됩니다.",
        "",
        "- 관리자 목록이므로 숨김(`isVisible=false`) FAQ도 조회됩니다.",
        "- `isVisible` 로 필터링할 수 있으며 `pagination` 이 함께 반환됩니다.",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },
    "GET /:faqId": {
      summary: "FAQ 상세",
      responses: {
        200: "조회 성공",
        404: "FAQ를 찾을 수 없습니다.",
      },
    },
    "PATCH /:faqId": {
      summary: "FAQ 수정",
      description: "전달한 필드만 수정됩니다.",
      responses: {
        200: "수정 성공",
        404: "FAQ를 찾을 수 없습니다.",
      },
    },
    "DELETE /:faqId": {
      summary: "FAQ 삭제",
      responses: {
        200: "삭제 성공",
        404: "FAQ를 찾을 수 없습니다.",
      },
    },
  },
});

// 사용자 공개 FAQ 문서
registerRouterDocs(publicFaqRouter, {
  basePath: "/api/faqs",
  tag: "FAQ (Public)",
  endpoints: {
    "GET /": {
      summary: "FAQ 목록 (공개)",
      description: [
        "인증 없이 접근 가능합니다.",
        "",
        "- 공개(`isVisible=true`) FAQ만 정렬 순서대로 반환합니다.",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },
  },
});
