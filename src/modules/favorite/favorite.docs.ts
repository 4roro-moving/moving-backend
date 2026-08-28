import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";
import favoriteRouter from "./favorite.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(favoriteRouter, {
  basePath: "/api/favorites",
  tag: "Favorite",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "고객만 이용할 수 있습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /movers": {
      summary: "찜한 기사 목록 조회",
      description: "찜한 최신순으로 기사 목록을 커서 기반 페이지네이션하여 조회합니다.",
      responses: { 200: "조회 성공" },
    },
    "DELETE /movers": {
      summary: "찜한 기사 일괄 해제",
      description:
        "`moverIds`로 선택한 기사를 해제하거나, `all: true`로 전체를 해제합니다. 전체 해제 시 `excludedIds`로 유지할 기사를 지정할 수 있습니다.",
      responses: { 200: "해제 성공" },
    },
    "POST /movers/:moverId": {
      summary: "기사 찜하기",
      description:
        "이미 찜한 기사라면 변경 없이 성공 응답을 반환합니다. 새로 찜한 경우 201, 기존 찜인 경우 200을 반환합니다.",
      responses: { 200: "이미 찜한 기사", 201: "찜 성공", 404: "기사를 찾을 수 없습니다." },
    },
    "DELETE /movers/:moverId": {
      summary: "기사 찜 해제",
      description: "해당 기사를 찜하지 않았어도 멱등적으로 성공 응답을 반환합니다.",
      responses: { 200: "해제 성공" },
    },
  },
});
