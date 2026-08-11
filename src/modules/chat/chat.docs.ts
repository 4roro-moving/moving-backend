import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";
import { chatRouter } from "./chat.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({
    example: "Bearer <access-token>",
  }),
});

registerRouterDocs(chatRouter, {
  basePath: "/api/chats",
  tag: "Chat",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "채팅방에 접근할 권한이 없습니다.",
    404: "채팅방 또는 견적을 찾을 수 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "POST /rooms": {
      summary: "채팅방 생성 또는 조회",
      description: [
        "견적 ID 기준으로 고객과 기사님의 채팅방을 생성하거나 기존 채팅방을 조회합니다.",
        "",
        "- 하나의 견적에는 하나의 채팅방만 생성됩니다.",
        "- 해당 견적의 고객 또는 견적을 보낸 기사님만 접근할 수 있습니다.",
      ].join("\n"),
      responses: {
        200: "채팅방 조회 성공",
      },
    },
    "GET /rooms/:roomId": {
      summary: "채팅방 상세 조회",
      description: "로그인한 사용자가 참여 중인 채팅방 상세 정보를 조회합니다.",
      responses: {
        200: "채팅방 상세 조회 성공",
      },
    },
    "GET /rooms/:roomId/messages": {
      summary: "채팅 메시지 목록 조회",
      description: [
        "채팅방의 메시지를 cursor 기반으로 조회합니다.",
        "",
        "- cursor가 없으면 최신 메시지를 조회합니다.",
        "- cursor가 있으면 해당 메시지 ID보다 이전 메시지를 조회합니다.",
        "- 응답 메시지는 화면 렌더링이 쉽도록 오래된 순서에서 최신 순서로 반환됩니다.",
        "- SYSTEM 메시지는 자동 안내이므로 `senderId`, `sender`가 null입니다.",
      ].join("\n"),
      responses: {
        200: "채팅 메시지 목록 조회 성공",
      },
    },
  },
});
