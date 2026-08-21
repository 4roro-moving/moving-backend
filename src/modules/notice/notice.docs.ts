import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";

import noticeRouter from "./notice.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(noticeRouter, {
  basePath: "/api/notices",
  tag: "Notice",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "고객 또는 기사님만 접근할 수 있습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "사용자 공지 목록",
      description: [
        "로그인 사용자에게 노출 가능한 공지사항을 조회합니다.",
        "",
        "- 공개(`isVisible=true`) 공지만 반환합니다.",
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
      description:
        "숨김 공지 또는 현재 사용자 역할 대상이 아닌 공지는 존재 여부를 노출하지 않고 404로 처리합니다.",
      responses: {
        200: "조회 성공",
        404: "공지를 찾을 수 없습니다.",
      },
    },
  },
});
