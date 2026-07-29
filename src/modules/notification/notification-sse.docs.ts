import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";
import notificationSseRouter from "./notification-sse.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({
    example: "Bearer <access-token>",
  }),
});

// 2026.07.29 장민주 - [추가] 알림 SSE OpenAPI 문서 등록
registerRouterDocs(notificationSseRouter, {
  basePath: "/api/notifications/sse",
  tag: "Notification",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
  },
  endpoints: {
    "GET /subscribe": {
      summary: "실시간 알림 구독",
      description: [
        "Server-Sent Events(SSE)를 이용하여 실시간 알림을 구독합니다.",
        "",
        "연결이 유지되는 동안 새로운 알림이 생성되면 클라이언트로 즉시 전송됩니다.",
        "",
        "## 인증 방식",
        "",
        "- Access Token을 Authorization 헤더에 Bearer 형식으로 전달합니다.",
        "- 브라우저 기본 EventSource는 Authorization 헤더 설정을 지원하지 않습니다.",
        "- 프론트에서는 fetch 기반 SSE 라이브러리를 사용하거나 동일한 기능을 직접 구현해야 합니다.",
        "",
        "## 응답 Content-Type",
        "",
        "- `text/event-stream`",
        "",
        "## 이벤트 종류",
        "",
        "### connected",
        "",
        "SSE 연결이 정상적으로 등록되었을 때 전송됩니다.",
        "",
        "```text",
        "event: connected",
        'data: { "connectedAt": "2026-07-29T07:00:00.000Z" }',
        "```",
        "",
        "### notification",
        "",
        "새로운 알림이 생성되었을 때 전송됩니다.",
        "",
        "```text",
        "event: notification",
        'data: { "id": 1, "type": "ESTIMATE_REQUEST_RECEIVED", "title": "새로운 견적 요청이 도착했습니다.", "content": "견적 요청을 확인해 주세요.", "linkUrl": "/estimates/1", "isRead": false, "readAt": null, "expiresAt": "2026-08-05T07:00:00.000Z", "createdAt": "2026-07-29T07:00:00.000Z" }',
        "```",
        "",
        "`notification` 이벤트의 data에는 다음 필드가 포함됩니다.",
        "",
        "- `id`: 알림 ID",
        "- `type`: 알림 유형",
        "- `title`: 알림 제목",
        "- `content`: 알림 내용",
        "- `linkUrl`: 알림 클릭 시 이동할 경로이며 없으면 `null`",
        "- `isRead`: 읽음 여부",
        "- `readAt`: 읽은 시각이며 읽지 않은 경우 `null`",
        "- `expiresAt`: 만료 시각이며 만료되지 않는 알림은 `null`",
        "- `createdAt`: 알림 생성 시각",
        "",
        "### heartbeat (SSE comment)",
        "",
        "연결 유지를 위해 30초마다 다음 형식의 SSE 주석을 전송합니다.",
        "",
        "```text",
        ": heartbeat 2026-07-29T07:00:00.000Z",
        "```",
        "",
        "- 별도의 `heartbeat` 이벤트로 전송되지 않습니다.",
        "- 클라이언트 이벤트 리스너로 수신하지 않습니다.",
        "- 프록시나 브라우저가 유휴 연결을 종료하지 않도록 유지하기 위한 용도입니다.",
      ].join("\n"),
      responses: {
        200: "SSE 연결 성공",
        401: "Access Token이 없거나 유효하지 않습니다.",
      },
    },
  },
});
