import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";
import { notificationRouter } from "./notification.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({
    example: "Bearer <access-token>",
  }),
});

// 2026.07.29 장민주 - [추가] 알림 API OpenAPI 문서 등록
registerRouterDocs(notificationRouter, {
  basePath: "/api/notifications",
  tag: "Notification",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "해당 알림에 접근할 권한이 없습니다.",
    404: "알림을 찾을 수 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "알림 목록 조회",
      description: "로그인한 사용자의 만료되지 않은 알림을 최신순으로 최대 5개 조회합니다.",
      responses: {
        200: "알림 목록 조회 성공",
      },
    },

    "GET /unread-count": {
      summary: "읽지 않은 알림 개수 조회",
      description: "로그인한 사용자의 만료되지 않은 읽지 않은 알림 개수를 조회합니다.",
      responses: {
        200: "읽지 않은 알림 개수 조회 성공",
      },
    },

    "PATCH /:notificationId/read": {
      summary: "알림 읽음 처리",
      description: [
        "특정 알림을 읽음 상태로 변경합니다.",
        "",
        "- 본인의 알림만 읽음 처리할 수 있습니다.",
        "- 이미 읽은 알림은 기존 읽음 상태를 그대로 반환합니다.",
        "- 채팅 알림은 읽은 시점부터 3일 후 만료됩니다.",
        "- 이미 만료된 알림은 읽음 처리할 수 없습니다.",
      ].join("\n"),
      responses: {
        200: "알림 읽음 처리 성공",
        403: "본인의 알림이 아닙니다.",
        404: "알림을 찾을 수 없습니다.",
      },
    },

    "PATCH /read-all": {
      summary: "모든 알림 읽음 처리",
      description: [
        "로그인한 사용자의 읽지 않은 알림을 모두 읽음 상태로 변경합니다.",
        "",
        "- 채팅 알림은 읽은 시점부터 3일 후 만료됩니다.",
        "- 그 외 알림의 기존 만료일은 변경하지 않습니다.",
      ].join("\n"),
      responses: {
        200: "모든 알림 읽음 처리 성공",
      },
    },
  },
});
