import { z } from "zod";

import { registerRouterDocs } from "../../../config/openapi-router";

import { adminReportRouter } from "./reports.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({
    example: "Bearer <access-token>",
  }),
});

registerRouterDocs(adminReportRouter, {
  basePath: "/api/admin/reports",
  tag: "Reports (Admin)",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "신고 관리 목록 조회",
      description: [
        "관리자가 접수된 신고 목록을 조회합니다.",
        "",
        "- `status`: PENDING | RESOLVED | REJECTED",
        "- `targetType`: REVIEW | MOVER | RESIDENCE_REVIEW | GIVEAWAY",
        "- `reason`: 신고 사유 필터",
        "- `keyword`: 대상 ID·신고 상세·신고자 이름·이메일 검색",
        "- `sort`: LATEST | OLDEST",
        "- 페이지 기반 페이지네이션을 사용합니다.",
        "- 처리된 신고에는 담당 관리자와 처리 정보가 포함됩니다.",
      ].join("\n"),
      responses: {
        200: "조회 성공",
      },
    },

    "GET /:reportId": {
      summary: "신고 상세 조회",
      description: [
        "관리자가 신고 상세 정보를 조회합니다.",
        "",
        "- 신고자와 처리 관리자 정보를 포함합니다.",
        "- 신고 처리 상태와 처리 메모를 포함합니다.",
        "- 신고 첨부 이미지가 있는 경우 `images`에 CloudFront URL 목록을 포함합니다.",
        "- 신고 대상의 상세 정보를 함께 조회합니다.",
        "- 대상 유형에 따라 REVIEW, MOVER, RESIDENCE_REVIEW, GIVEAWAY 정보를 반환합니다.",
        "- 신고 대상이 삭제되었거나 존재하지 않는 경우 `target`은 null일 수 있습니다.",
      ].join("\n"),
      responses: {
        200: "조회 성공",
        404: "신고를 찾을 수 없습니다.",
      },
    },

    "PATCH /:reportId": {
      summary: "신고 처리",
      description: [
        "관리자가 접수 상태(PENDING)의 신고를 처리합니다.",
        "",
        "- `status`: RESOLVED 또는 REJECTED만 허용합니다.",
        "- `handlerNote`: 관리자 처리 메모입니다.",
        "- 처리 관리자 ID와 처리 시각을 함께 저장합니다.",
        "- 신고 처리 이력을 ActivityLog(UPDATE / REPORT)에 기록합니다.",
        "- 신고자에게 처리 결과 알림(NotificationType=`REPORT_RESULT`)을 저장합니다.",
        "- 알림 SSE 전송은 트랜잭션 커밋 이후에 수행합니다.",
        "- 이미 처리된 신고는 다시 처리할 수 없습니다.",
        "- 동시 처리 요청은 먼저 처리된 요청만 성공합니다.",
      ].join("\n"),
      responses: {
        200: "신고 처리 성공",
        404: "신고를 찾을 수 없습니다.",
        409: "이미 처리된 신고입니다.",
      },
    },
  },
});
