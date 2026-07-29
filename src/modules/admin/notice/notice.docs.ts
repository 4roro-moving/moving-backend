import { z } from "zod";

import { registerRouterDocs } from "../../../config/openapi-router";
import noticeRouter from "./notice.route";

/**
 * auth 모듈 완성 전까지 사용하는 개발용 인증 헤더입니다.
 * JWT 적용 후에는 bearerAuth 시큐리티 스키마로 교체합니다.
 */
const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(noticeRouter, {
  basePath: "/api/admin/notices",
  tag: "Notice (Admin)",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "POST /": {
      summary: "공지 생성",
      description: [
        "관리자가 공지사항을 등록합니다.",
        "",
        "- `audience` 로 노출 대상(전체/고객/기사)을 지정합니다.",
        "- `isPinned` 가 true 이면 목록 상단에 고정됩니다.",
        "- `isVisible` 이 false 이면 숨김 상태로 저장됩니다.",
        "- `sendNotification` 이 true 이면 대상 사용자에게 알림이 발송됩니다.",
      ].join("\n"),
      responses: {
        201: "생성 성공",
      },
    },

    "GET /": {
      summary: "공지 목록",
      description: [
        "고정 공지 우선, 이후 최신순으로 정렬됩니다.",
        "",
        "- 관리자 목록이므로 숨김(`isVisible=false`) 공지도 조회됩니다.",
        "- `audience`, `isVisible` 로 필터링할 수 있으며 `pagination` 이 함께 반환됩니다.",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },

    "GET /:noticeId": {
      summary: "공지 상세",
      responses: {
        200: "조회 성공",
        404: "공지를 찾을 수 없습니다.",
      },
    },

    "PATCH /:noticeId": {
      summary: "공지 수정",
      description: "전달한 필드만 수정됩니다. 알림 재발송은 지원하지 않습니다.",
      responses: {
        200: "수정 성공",
        404: "공지를 찾을 수 없습니다.",
      },
    },

    "DELETE /:noticeId": {
      summary: "공지 삭제",
      responses: {
        200: "삭제 성공",
        404: "공지를 찾을 수 없습니다.",
      },
    },
  },
});
