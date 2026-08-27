import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";
import reviewRouter from "./review.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({
    example: "Bearer <access-token>",
  }),
});

registerRouterDocs(reviewRouter, {
  basePath: "/api/reviews",
  tag: "Review",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "고객 권한이 필요합니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /me": {
      summary: "내 리뷰 목록 조회",
      description: [
        "현재 로그인한 고객이 작성한 리뷰 목록을 페이지네이션하여 조회합니다.",
        "",
        "- page 기본값은 1, 최대 1000입니다.",
        "- limit 기본값은 10, 최대 50입니다.",
        "- 관리자가 숨긴 리뷰도 포함됩니다.",
        "- `isHidden`: 숨김 여부.",
        "- `hiddenReason`: 숨김일 때 최신 HIDE ActivityLog.memo(처리 사유). 공개면 null.",
        "- 기사 공개/마이페이지 리뷰 API에는 숨김 리뷰·사유를 노출하지 않습니다.",
      ].join("\n"),
      responses: {
        200: "내 리뷰 목록 조회 성공",
      },
    },
    "GET /reviewable": {
      summary: "리뷰 작성 가능 견적 목록 조회",
      description: [
        "현재 로그인한 고객이 리뷰를 작성할 수 있는 견적 목록을 조회합니다.",
        "",
        "- 확정 또는 완료 상태의 본인 견적만 포함됩니다.",
        "- 이미 리뷰를 작성한 견적은 제외됩니다.",
      ].join("\n"),
      responses: {
        200: "리뷰 작성 가능 견적 목록 조회 성공",
      },
    },
    "POST /": {
      summary: "리뷰 작성",
      description: [
        "현재 로그인한 고객이 본인의 확정 또는 완료 견적에 리뷰를 작성합니다.",
        "",
        "- estimateId, rating, content를 전달합니다.",
        "- rating은 1~5 사이 정수입니다.",
        "- content는 최소 10자 이상이어야 합니다.",
        "- 하나의 견적에는 리뷰를 한 번만 작성할 수 있습니다.",
      ].join("\n"),
      responses: {
        201: "리뷰 작성 성공",
        404: "견적을 찾을 수 없습니다.",
        409: "이미 리뷰를 작성했거나 리뷰를 작성할 수 없는 상태입니다.",
      },
    },
  },
});
