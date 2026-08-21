import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";

import noticeRouter from "./notice.route";

const optionalAuthHeaderSchema = z.object({
  authorization: z.string().optional().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(noticeRouter, {
  basePath: "/api/notices",
  tag: "Notice",
  headers: optionalAuthHeaderSchema,
  commonResponses: {
    401: "Authorization 헤더 형식이 잘못되었거나 유효하지 않은 토큰입니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "사용자 공지 목록",
      description: [
        "비회원과 로그인 사용자 모두 노출 가능한 공지사항을 조회합니다.",
        "",
        "- 공개(`isVisible=true`) 공지만 반환합니다.",
        "- 비회원은 `ALL` 대상 공지만 조회합니다.",
        "- 고객은 `ALL`, `CUSTOMER` 대상 공지를 조회합니다.",
        "- 기사님은 `ALL`, `MOVER` 대상 공지를 조회합니다.",
        "- 고정 공지 우선, 이후 최신순으로 정렬됩니다.",
        "- `page`, `limit`, `keyword`를 지원합니다.",
      ].join("\n"),
      responses: {
        200: "조회 성공",
      },
    },

    "GET /:noticeId": {
      summary: "사용자 공지 상세",
      description: [
        "비회원과 로그인 사용자 모두 접근할 수 있습니다.",
        "- 숨김 공지는 404로 처리합니다.",
        "- 비회원은 `ALL` 대상 공지만 조회할 수 있습니다.",
        "- 로그인 사용자는 자신의 역할 대상 공지도 조회할 수 있습니다.",
        "- 상세 조회가 성공하면 조회수가 1 증가합니다.",
      ].join("\n"),
      responses: {
        200: "조회 성공",
        404: "공지를 찾을 수 없습니다.",
      },
    },
  },
});
