import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";

import { adminTermsRouter, publicTermsRouter } from "./terms.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

// 관리자 약관 문서
registerRouterDocs(adminTermsRouter, {
  basePath: "/api/admin/terms",
  tag: "Terms (Admin)",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없습니다. (TERMS_MANAGE 권한 필요)",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "POST /": {
      summary: "약관 생성 (DRAFT)",
      description: [
        "새 약관을 초안(DRAFT) 상태로 등록합니다. 생성 직후에는 사용자에게 노출되지 않습니다.",
        "",
        "- `type` + `version` 조합은 중복될 수 없습니다. (TERMS_VERSION_DUPLICATED)",
        "- `audience` 로 노출 대상(ALL/CUSTOMER/MOVER)을 지정합니다. 생략 시 ALL 입니다.",
        "- `isRequired` 가 true 이면 회원가입 시 필수 동의 대상이 됩니다. 기본값 true.",
        "- `effectiveAt` 은 YYYY-MM-DD 형식이며, 생략하면 게시 시점이 시행일이 됩니다.",
        "",
        "사용자에게 노출하려면 별도로 `PATCH /:termsId/publish` 를 호출해야 합니다.",
      ].join("\n"),
      responses: {
        201: "생성 성공",
        409: "같은 유형에 동일한 버전이 이미 존재합니다.",
      },
    },

    "GET /": {
      summary: "약관 목록",
      description: [
        "삭제되지 않은 약관을 유형·버전 순으로 조회합니다.",
        "",
        "- `type`, `status` 로 필터링할 수 있으며 `pagination` 이 함께 반환됩니다.",
        "- `keyword` 로 제목과 본문을 검색할 수 있습니다. (부분 일치, 대소문자 무시)",
        "- 목록 응답에는 본문(`content`)이 포함되지 않습니다. 본문은 상세 조회로 확인하세요.",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },

    "GET /:termsId": {
      summary: "약관 상세",
      description: "본문(`content`)을 포함한 전체 정보를 반환합니다.",
      responses: {
        200: "조회 성공",
        404: "약관을 찾을 수 없습니다.",
      },
    },

    "PATCH /:termsId": {
      summary: "약관 수정",
      description: [
        "전달한 필드만 수정됩니다.",
        "",
        "- **DRAFT 상태에서만 수정할 수 있습니다.** 이미 게시(PUBLISHED)되거나",
        "  보관(ARCHIVED)된 약관은 이력 보존을 위해 수정이 막혀 있습니다.",
        "- 내용을 바꿔야 한다면 새 버전을 DRAFT 로 만들고 게시하세요.",
        "",
        "조회와 변경을 한 쿼리로 묶어 처리하므로, 다른 요청이 그사이 상태를 바꾸면",
        "TERMS_NOT_EDITABLE 이 반환됩니다.",
      ].join("\n"),
      responses: {
        200: "수정 성공",
        404: "약관을 찾을 수 없습니다.",
        409: "DRAFT 상태가 아니어서 수정할 수 없습니다.",
      },
    },

    "PATCH /:termsId/publish": {
      summary: "약관 게시",
      description: [
        "DRAFT 약관을 게시(PUBLISHED)합니다. 이 시점부터 사용자에게 노출됩니다.",
        "",
        "- 같은 `type` 의 기존 게시본은 자동으로 ARCHIVED 로 내려갑니다.",
        "- **한 유형에 PUBLISHED 는 항상 하나만 존재합니다.**",
        "  애플리케이션 검증이 아니라 부분 unique 인덱스로 DB 가 보장하므로,",
        "  동시에 두 요청이 게시를 시도해도 하나만 성공합니다.",
        "- 경합으로 실패하면 TERMS_NOT_PUBLISHABLE 이 반환됩니다.",
        "",
        "게시하면 새 `termsId` 가 현재 버전이 되므로, 기존에 동의한 사용자는",
        "`GET /api/terms/me/pending` 에서 재동의 대상으로 자동 조회됩니다.",
      ].join("\n"),
      responses: {
        200: "게시 성공",
        404: "약관을 찾을 수 없습니다.",
        409: "DRAFT 상태가 아니거나 이미 다른 요청이 게시했습니다.",
      },
    },

    "DELETE /:termsId": {
      summary: "약관 삭제",
      description: [
        "- DRAFT 약관은 물리 삭제됩니다.",
        "- 게시된 적이 있는 약관은 동의 이력이 참조하므로 삭제할 수 없습니다.",
        "  (TERMS_NOT_DELETABLE)",
      ].join("\n"),
      responses: {
        200: "삭제 성공",
        404: "약관을 찾을 수 없습니다.",
        409: "게시 이력이 있어 삭제할 수 없습니다.",
      },
    },
  },
});

// 사용자 공개 약관 문서
registerRouterDocs(publicTermsRouter, {
  basePath: "/api/terms",
  tag: "Terms (Public)",
  commonResponses: {
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "게시 중인 약관 목록 (공개)",
      description: [
        "인증 없이 접근 가능합니다. 각 유형의 현재 게시(PUBLISHED)본만 반환합니다.",
        "",
        "- 응답의 `audience` 로 노출 대상을 판단하세요.",
        "  회원가입 화면에서는 `ALL` 과 해당 역할(`CUSTOMER` 또는 `MOVER`) 약관만 보여주면 됩니다.",
        "- `isRequired` 가 true 인 약관은 가입 시 반드시 동의해야 합니다.",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },

    "GET /me/agreements": {
      summary: "내 약관 동의 이력",
      description: [
        "로그인한 사용자의 약관 동의 이력을 반환합니다.",
        "",
        "- 동의 이력은 **갱신되지 않고 계속 쌓입니다.** 마케팅 수신처럼 동의와 철회를",
        "  반복하는 항목의 시점별 기록을 남기기 위함입니다.",
        "- 따라서 현재 상태는 `termsId` 별 **가장 최근 1건**으로 판단해야 합니다.",
      ].join("\n"),
      responses: {
        200: "조회 성공",
        401: "인증이 필요합니다.",
      },
    },

    "POST /me/agreements": {
      summary: "약관 동의 저장 · 변경",
      description: [
        "로그인한 사용자가 약관 동의 상태를 저장하거나 변경합니다.",
        "",
        "- `agreements` 는 `{ termsId, isAgreed }` 배열입니다. (1~20건)",
        "- 전달한 `termsId` 중 **현재 게시본이면서 해당 역할이 대상인 것만** 반영됩니다.",
        "  임의의 id 를 보내면 TERMS_AGREEMENT_INVALID 가 반환됩니다.",
        "- 회원가입과 달리 **필수 약관을 모두 동의했는지는 검사하지 않습니다.**",
        "  마케팅 수신 동의만 끄는 경우가 있기 때문입니다.",
        "  필수 약관 미동의 여부는 `GET /me/pending` 으로 확인하세요.",
      ].join("\n"),
      responses: {
        200: "저장 성공",
        401: "인증이 필요합니다.",
        409: "게시 중이 아니거나 대상이 아닌 약관이 포함되어 있습니다.",
      },
    },

    "GET /me/pending": {
      summary: "재동의가 필요한 필수 약관",
      description: [
        "현재 게시 중인 필수 약관 중 사용자가 아직 동의하지 않은 것을 반환합니다.",
        "",
        "약관을 개정하면 새 Terms 행이 생겨 `termsId` 가 달라집니다.",
        "따라서 별도의 재동의 플래그 없이, 이 엔드포인트가 개정된 약관을 자동으로 잡아냅니다.",
        "",
        "- 빈 배열이면 재동의할 것이 없습니다.",
        "- 항목이 있으면 동의 화면을 띄우고 `POST /me/agreements` 로 저장하세요.",
      ].join("\n"),
      responses: {
        200: "조회 성공",
        401: "인증이 필요합니다.",
      },
    },

    "GET /:type": {
      summary: "유형별 약관 상세 (공개)",
      description: [
        "인증 없이 접근 가능합니다. 해당 유형의 현재 게시본을 본문과 함께 반환합니다.",
        "",
        "`type`: TERMS_OF_SERVICE | PRIVACY_POLICY | MARKETING_POLICY | LOCATION_POLICY | MOVER_POLICY | OTHER",
      ].join("\n"),
      responses: {
        200: "조회 성공",
        404: "게시 중인 약관이 없습니다.",
      },
    },
  },
});
