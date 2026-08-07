import { z } from "zod";

import { registerRouterDocs } from "../../../config/openapi-router";

import { adminReviewRouter } from "./contents.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(adminReviewRouter, {
  basePath: "/api/admin/reviews",
  tag: "Content (Admin)",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "리뷰 관리 목록 조회",
      description: [
        "관리자가 서비스 리뷰 목록을 조회합니다. 숨김 리뷰도 포함됩니다.",
        "",
        "- `keyword`: 작성자명·본문 검색",
        "- `isHidden`: 숨김 여부 필터",
        "- `sort`: LATEST | OLDEST | RATING_HIGH | RATING_LOW | REPORT_HIGH",
        "- `reportedOnly`: 신고 누적 콘텐츠만 조회",
        "- 각 항목에 `latestModeration`(최신 숨김/복구 사유)을 포함합니다.",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },

    "POST /:reviewId/hide": {
      summary: "리뷰 숨김 처리",
      description: [
        "리뷰를 숨김 처리합니다.",
        "",
        "- `isHidden` 을 true 로 변경합니다.",
        "- ActivityLog(HIDE) + memo(사유)를 기록합니다.",
        "- 작성자에게 CONTENT_HIDDEN 알림을 발송합니다.",
        "- 이미 숨김이면 409 CONTENT_ALREADY_HIDDEN 을 반환합니다.",
      ].join("\n"),
      responses: {
        200: "숨김 처리 성공",
        404: "콘텐츠를 찾을 수 없습니다.",
        409: "이미 숨김 처리된 콘텐츠입니다.",
      },
    },

    "POST /:reviewId/unhide": {
      summary: "리뷰 복구(숨김 해제)",
      description: [
        "숨김 처리된 리뷰를 다시 공개합니다.",
        "",
        "- `isHidden` 을 false 로 변경합니다.",
        "- ActivityLog(UNHIDE)를 기록합니다.",
        "- 작성자에게 CONTENT_RESTORED 알림을 발송합니다.",
        "- 숨김 상태가 아니면 409 CONTENT_NOT_HIDDEN 을 반환합니다.",
      ].join("\n"),
      responses: {
        200: "복구 성공",
        404: "콘텐츠를 찾을 수 없습니다.",
        409: "숨김 상태가 아니므로 복구할 수 없습니다.",
      },
    },
  },
});
