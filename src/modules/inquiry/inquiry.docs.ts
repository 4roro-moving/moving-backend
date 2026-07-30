import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";
import { adminInquiryRouter, inquiryRouter } from "./inquiry.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

// 사용자 문의 문서
registerRouterDocs(inquiryRouter, {
  basePath: "/api/inquiries",
  tag: "Inquiry",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "본인의 문의가 아닙니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "POST /": {
      summary: "문의 생성",
      description: [
        "제목·분류·첫 메시지를 함께 받아 문의를 생성합니다.",
        "",
        "- 생성 즉시 `OPEN` 상태가 됩니다.",
        "- 문의와 첫 메시지는 한 트랜잭션으로 함께 생성됩니다.",
      ].join("\n"),
      responses: { 201: "생성 성공" },
    },
    "GET /": {
      summary: "내 문의 목록",
      description: "최근 대화순으로 조회됩니다. `status` 로 필터할 수 있습니다.",
      responses: { 200: "조회 성공" },
    },
    "GET /:inquiryId": {
      summary: "내 문의 상세",
      description: "메시지 스레드를 포함합니다. 조회 시 상대방 메시지가 읽음 처리됩니다.",
      responses: { 200: "조회 성공", 404: "문의를 찾을 수 없습니다." },
    },
    "POST /:inquiryId/messages": {
      summary: "메시지 추가",
      description:
        "열린 문의에만 가능하며, 추가 시 상태가 `OPEN` 이 됩니다. 종료된 문의는 불가합니다.",
      responses: {
        201: "추가 성공",
        404: "문의를 찾을 수 없습니다.",
        409: "이미 종료된 문의입니다.",
      },
    },
    "PATCH /:inquiryId/close": {
      summary: "문의 종료",
      responses: {
        200: "종료 성공",
        404: "문의를 찾을 수 없습니다.",
        409: "이미 종료된 문의입니다.",
      },
    },
  },
});

// 관리자 문의 문서
registerRouterDocs(adminInquiryRouter, {
  basePath: "/api/admin/inquiries",
  tag: "Inquiry (Admin)",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "문의 목록 (관리자)",
      description: [
        "전체 문의를 최근 대화순으로 조회합니다.",
        "",
        "- `status` 로 특정 상태만 조회할 수 있습니다.",
        "- `openOnly=true` 면 미종료(OPEN/ANSWERED) 문의만 조회합니다.",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },
    "GET /:inquiryId": {
      summary: "문의 상세 (관리자)",
      description: "조회 시 사용자 메시지가 읽음 처리됩니다.",
      responses: { 200: "조회 성공", 404: "문의를 찾을 수 없습니다." },
    },
    "POST /:inquiryId/answer": {
      summary: "관리자 답변",
      description:
        "답변 메시지를 추가하고 상태를 `ANSWERED` 로 변경하며, 담당 관리자로 배정됩니다.",
      responses: {
        201: "답변 성공",
        404: "문의를 찾을 수 없습니다.",
        409: "이미 종료된 문의입니다.",
      },
    },
    "PATCH /:inquiryId/close": {
      summary: "문의 종료 (관리자)",
      responses: {
        200: "종료 성공",
        404: "문의를 찾을 수 없습니다.",
        409: "이미 종료된 문의입니다.",
      },
    },
  },
});
