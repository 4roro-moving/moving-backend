import { z } from "zod";

import { registerRouterDocs } from "../../../config/openapi-router";

import { ADMIN_GIVEAWAY_SORTS } from "./giveaways.constants";
import { adminGiveawayRouter } from "./giveaways.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(adminGiveawayRouter, {
  basePath: "/api/admin/giveaways",
  tag: "Giveaway (Admin)",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "나눔글 관리 목록 조회",
      description: [
        "관리자가 나눔글 목록을 조회합니다. 숨김 글도 포함됩니다.",
        "",
        "- `keyword`: 작성자명·제목·설명 검색",
        "- `isHidden`: 숨김 여부 필터",
        `- \`sort\`: ${ADMIN_GIVEAWAY_SORTS.join(" | ")} (별점 정렬 없음)`,
        "- 각 항목에 `reportCount`, `latestModeration`(최신 숨김/복구 사유)을 포함합니다.",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },

    "POST /:giveawayId/hide": {
      summary: "나눔글 숨김 처리",
      description: [
        "나눔글을 숨김 처리합니다.",
        "",
        "- `isHidden` 을 true 로 변경합니다.",
        "- `reason` 은 공백 제외 최소 10자 이상이어야 합니다.",
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

    "POST /:giveawayId/unhide": {
      summary: "나눔글 복구(숨김 해제)",
      description: [
        "숨김 처리된 나눔글을 다시 공개합니다.",
        "",
        "- `isHidden` 을 false 로 변경합니다.",
        "- request body 에 `reason` 필드를 받지 않습니다.",
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
