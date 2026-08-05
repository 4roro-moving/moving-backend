import { registerRouterDocs } from "../../../config/openapi-router";

import { adminAuthRouter } from "./admin-auth.route";

registerRouterDocs(adminAuthRouter, {
  basePath: "/api/admin/auth",
  tag: "Admin Auth",
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없거나 비활성화된 계정입니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "POST /login": {
      summary: "관리자 로그인",
      description: [
        "관리자 이메일과 비밀번호를 검증하고 관리자 인증 토큰을 발급합니다.",
        "",
        "- LOCAL 방식으로 생성된 ADMIN 계정만 로그인할 수 있습니다.",
        "- Access Token은 응답 Body로 반환됩니다.",
        "- Refresh Token은 `adminRefreshToken` HttpOnly Cookie로 반환됩니다.",
        "- 일반 사용자 계정, 존재하지 않는 계정, 잘못된 비밀번호에는 동일한 401 응답을 반환합니다.",
        "- 비활성화되었거나 탈퇴 처리된 관리자 계정은 로그인할 수 없습니다.",
      ].join("\n"),
      responses: {
        200: "관리자 로그인 성공",
        401: "이메일 또는 비밀번호가 올바르지 않습니다.",
        403: "비활성화되었거나 탈퇴 처리된 관리자 계정입니다.",
      },
    },

    "POST /refresh": {
      summary: "관리자 Access Token 재발급",
      description: [
        "관리자 Refresh Token을 검증하고 새로운 Access Token과 Refresh Token을 발급합니다.",
        "",
        "- 요청 Body는 없습니다.",
        "- `adminRefreshToken` HttpOnly Cookie가 필요합니다.",
        "- Refresh Token Rotation을 적용합니다.",
        "- 기존 Refresh Token은 폐기되고 다시 사용할 수 없습니다.",
        "- 새로운 Refresh Token은 `Set-Cookie` 응답 헤더로 반환됩니다.",
        "- 비활성화된 관리자는 재발급할 수 없으며 기존 Refresh Token이 모두 폐기됩니다.",
        "- CSRF 방어를 위해 허용된 Origin인지 검증합니다.",
      ].join("\n"),
      responses: {
        200: "관리자 Access Token 재발급 성공",
        401: "Refresh Token이 없거나 유효하지 않거나 이미 폐기되었습니다.",
        403: "비활성화된 관리자 계정이거나 허용되지 않은 요청 출처입니다.",
      },
    },

    "POST /logout": {
      summary: "관리자 로그아웃",
      description: [
        "현재 관리자 로그인 세션을 종료합니다.",
        "",
        "- 요청 Body는 없습니다.",
        "- `adminRefreshToken` HttpOnly Cookie를 사용합니다.",
        "- 현재 Cookie에 해당하는 Refresh Token 세션만 폐기합니다.",
        "- Cookie가 없거나 이미 폐기된 상태여도 성공을 반환하여 멱등성을 유지합니다.",
        "- 응답 시 `adminRefreshToken` Cookie를 삭제합니다.",
        "- CSRF 방어를 위해 허용된 Origin인지 검증합니다.",
      ].join("\n"),
      responses: {
        200: "관리자 로그아웃 성공",
        403: "허용되지 않은 요청 출처입니다.",
      },
    },

    "GET /me": {
      summary: "현재 로그인한 관리자 조회",
      description: [
        "현재 로그인한 관리자 정보를 조회합니다.",
        "",
        "- `Authorization: Bearer <admin-access-token>` 헤더가 필요합니다.",
        "- Access Token의 서명과 만료 시간을 검증합니다.",
        "- ADMIN 역할인지 확인합니다.",
        "- DB에서 관리자 계정의 활성 상태를 다시 확인합니다.",
        "- Access Token이 남아 있어도 비활성화된 관리자는 즉시 차단됩니다.",
      ].join("\n"),
      responses: {
        200: "현재 관리자 정보 조회 성공",
        401: "Access Token이 없거나 유효하지 않습니다.",
        403: "관리자 권한이 없거나 비활성화된 계정입니다.",
      },
    },
  },
});
