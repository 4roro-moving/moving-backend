import { registerRouterDocs } from "../../config/openapi-router";

import { authRouter } from "./auth.route";

// 2026.07.30 장민주 - [추가] 인증 API OpenAPI 문서 등록
registerRouterDocs(authRouter, {
  basePath: "/api/auth",
  tag: "Auth",
  commonResponses: {
    400: "요청을 처리할 수 없습니다.",
    401: "인증에 실패했습니다.",
    409: "이미 사용 중인 정보입니다.",
    422: "입력값이 올바르지 않습니다.",
    500: "서버 내부 오류가 발생했습니다.",
  },
  endpoints: {
    /*
     * 로컬 회원가입 API
     */
    "POST /signup/customer": {
      summary: "일반 고객 회원가입",
      description: [
        "일반 고객 계정을 생성합니다.",
        "",
        "- 생성되는 사용자의 역할은 CUSTOMER입니다.",
        "- 이메일은 소문자로 변환하여 저장합니다.",
        "- 이메일은 올바른 이메일 형식이어야 합니다.",
        "- 비밀번호는 8자 이상 100자 이하로 입력해야 합니다.",
        "- 비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.",
        "- 이름은 1자 이상 50자 이하로 입력해야 합니다.",
        "- 휴대전화 번호는 하이픈 포함 또는 미포함 형식을 모두 허용합니다.",
        "- 휴대전화 번호의 하이픈은 제거된 상태로 저장됩니다.",
        "- 이메일 또는 휴대전화 번호가 이미 사용 중인 경우 가입할 수 없습니다.",
        "- 회원가입 성공 시 Access Token을 Response Body로 반환합니다.",
        "- Refresh Token은 HttpOnly Cookie로 저장됩니다.",
      ].join("\n"),
      responses: {
        201: "일반 고객 회원가입 성공",
        409: "이미 사용 중인 이메일 또는 휴대전화 번호입니다.",
      },
    },

    "POST /signup/mover": {
      summary: "기사님 회원가입",
      description: [
        "기사님 계정을 생성합니다.",
        "",
        "- 생성되는 사용자의 역할은 MOVER입니다.",
        "- 이메일은 소문자로 변환하여 저장합니다.",
        "- 이메일은 올바른 이메일 형식이어야 합니다.",
        "- 비밀번호는 8자 이상 100자 이하로 입력해야 합니다.",
        "- 비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.",
        "- 이름은 1자 이상 50자 이하로 입력해야 합니다.",
        "- 휴대전화 번호는 하이픈 포함 또는 미포함 형식을 모두 허용합니다.",
        "- 휴대전화 번호의 하이픈은 제거된 상태로 저장됩니다.",
        "- 이메일 또는 휴대전화 번호가 이미 사용 중인 경우 가입할 수 없습니다.",
        "- 회원가입 성공 시 Access Token을 Response Body로 반환합니다.",
        "- Refresh Token은 HttpOnly Cookie로 저장됩니다.",
      ].join("\n"),
      responses: {
        201: "기사님 회원가입 성공",
        409: "이미 사용 중인 이메일 또는 휴대전화 번호입니다.",
      },
    },

    /*
     * 로컬 로그인 API
     */
    "POST /login": {
      summary: "로컬 로그인",
      description: [
        "이메일과 비밀번호를 이용하여 로그인합니다.",
        "",
        "- 이메일은 소문자로 변환한 뒤 조회합니다.",
        "- 로컬 회원가입으로 생성된 계정만 비밀번호 로그인을 사용할 수 있습니다.",
        "- 이메일 또는 비밀번호가 일치하지 않으면 로그인할 수 없습니다.",
        "- 비활성화된 계정은 로그인할 수 없습니다.",
        "- 로그인 성공 시 사용자 정보와 Access Token을 반환합니다.",
        "- Refresh Token은 HttpOnly Cookie로 저장됩니다.",
      ].join("\n"),
      responses: {
        200: "로그인 성공",
        401: "이메일 또는 비밀번호가 일치하지 않습니다.",
        403: "비활성화된 계정이거나 로컬 로그인을 사용할 수 없습니다.",
      },
    },

    /*
     * Google OAuth API
     */
    "POST /oauth/google": {
      summary: "Google OAuth 로그인",
      description: [
        "Google Authorization Code를 이용하여 로그인 또는 회원가입을 진행합니다.",
        "",
        "- 프론트엔드에서 발급받은 Google Authorization Code를 전달해야 합니다.",
        "- intent는 login 또는 signup이어야 합니다.",
        "- intent가 login이면 기존 회원만 로그인하고, 계정이 없으면 가입하지 않습니다.",
        "- intent가 signup이면 신규 회원을 생성합니다. 기존 회원이면 로그인합니다.",
        "- 신규 회원인 경우 CUSTOMER 또는 MOVER 역할을 함께 전달해야 합니다.",
        "- 기존 회원인 경우 DB에 저장된 역할을 사용합니다.",
        "- ADMIN 역할은 OAuth 요청을 통해 생성할 수 없습니다.",
        "- Google 계정 이메일과 동일한 기존 계정이 있는 경우 계정 연결 정책에 따라 처리됩니다.",
        "- 로그인 성공 시 사용자 정보와 Access Token을 반환합니다.",
        "- Refresh Token은 HttpOnly Cookie로 저장됩니다.",
      ].join("\n"),
      responses: {
        200: "Google 로그인 성공",
        400: "Google OAuth 인증 정보가 올바르지 않습니다.",
        401: "Google 인증에 실패했습니다.",
        404: "가입된 소셜 계정이 없습니다.",
        409: "기존 계정과 충돌하는 정보가 있습니다.",
      },
    },

    /*
     * Kakao OAuth API
     */
    "POST /oauth/kakao": {
      summary: "Kakao OAuth 로그인",
      description: [
        "Kakao Authorization Code를 이용하여 로그인 또는 회원가입을 진행합니다.",
        "",
        "- 프론트엔드에서 발급받은 Kakao Authorization Code를 전달해야 합니다.",
        "- intent는 login 또는 signup이어야 합니다.",
        "- intent가 login이면 기존 회원만 로그인하고, 계정이 없으면 가입하지 않습니다.",
        "- intent가 signup이면 신규 회원을 생성합니다. 기존 회원이면 로그인합니다.",
        "- 신규 회원인 경우 CUSTOMER 또는 MOVER 역할을 함께 전달해야 합니다.",
        "- 기존 회원인 경우 DB에 저장된 역할을 사용합니다.",
        "- ADMIN 역할은 OAuth 요청을 통해 생성할 수 없습니다.",
        "- Kakao 계정 이메일과 동일한 기존 계정이 있는 경우 계정 연결 정책에 따라 처리됩니다.",
        "- 로그인 성공 시 사용자 정보와 Access Token을 반환합니다.",
        "- Refresh Token은 HttpOnly Cookie로 저장됩니다.",
      ].join("\n"),
      responses: {
        200: "Kakao 로그인 성공",
        400: "Kakao OAuth 인증 정보가 올바르지 않습니다.",
        401: "Kakao 인증에 실패했습니다.",
        404: "가입된 소셜 계정이 없습니다.",
        409: "기존 계정과 충돌하는 정보가 있습니다.",
      },
    },

    /*
     * Naver OAuth API
     */
    "GET /oauth/naver/state": {
      summary: "Naver OAuth state 발급",
      description: [
        "Naver OAuth 요청 위조를 방지하기 위한 state 값을 발급합니다.",
        "",
        "- 생성된 state는 서명된 HttpOnly Cookie에 저장됩니다.",
        "- 동일한 state 값이 Response Body에도 반환됩니다.",
        "- 프론트엔드는 반환된 state를 Naver 인증 요청에 포함해야 합니다.",
        "- state의 유효시간은 10분입니다.",
        "- Naver 로그인 요청이 완료되면 state Cookie는 삭제됩니다.",
      ].join("\n"),
      responses: {
        200: "Naver OAuth state 발급 성공",
      },
    },

    "POST /oauth/naver": {
      summary: "Naver OAuth 로그인",
      description: [
        "Naver Authorization Code와 state를 이용하여 로그인 또는 회원가입을 진행합니다.",
        "",
        "- 먼저 Naver OAuth state 발급 API를 호출해야 합니다.",
        "- 요청 Body의 state와 서명된 Cookie의 state가 일치해야 합니다.",
        "- state는 한 번만 사용할 수 있으며 검증 후 Cookie에서 삭제됩니다.",
        "- 프론트엔드에서 발급받은 Naver Authorization Code를 전달해야 합니다.",
        "- intent는 login 또는 signup이어야 합니다.",
        "- intent가 login이면 기존 회원만 로그인하고, 계정이 없으면 가입하지 않습니다.",
        "- intent가 signup이면 신규 회원을 생성합니다. 기존 회원이면 로그인합니다.",
        "- 신규 회원인 경우 CUSTOMER 또는 MOVER 역할을 함께 전달해야 합니다.",
        "- 기존 회원인 경우 DB에 저장된 역할을 사용합니다.",
        "- ADMIN 역할은 OAuth 요청을 통해 생성할 수 없습니다.",
        "- 로그인 성공 시 사용자 정보와 Access Token을 반환합니다.",
        "- Refresh Token은 HttpOnly Cookie로 저장됩니다.",
      ].join("\n"),
      responses: {
        200: "Naver 로그인 성공",
        400: "OAuth state 또는 Naver 인증 정보가 올바르지 않습니다.",
        401: "Naver 인증에 실패했습니다.",
        404: "가입된 소셜 계정이 없습니다.",
        409: "기존 계정과 충돌하는 정보가 있습니다.",
      },
    },

    /*
     * 토큰 재발급 API
     */
    "POST /refresh": {
      summary: "Access Token 재발급",
      description: [
        "Refresh Token을 이용하여 새로운 Access Token과 Refresh Token을 발급합니다.",
        "",
        "- Refresh Token은 Request Body가 아닌 HttpOnly Cookie에서 조회합니다.",
        "- CSRF 보호를 위해 요청의 Origin을 검증합니다.",
        "- 허용된 프론트엔드 Origin에서 요청해야 합니다.",
        "- 운영 환경에서는 Origin 헤더가 없거나 허용되지 않은 경우 요청이 거부됩니다.",
        "- Refresh Token Rotation을 적용합니다.",
        "- 기존 Refresh Token은 재사용할 수 없도록 처리됩니다.",
        "- 새로운 Access Token은 Response Body로 반환됩니다.",
        "- 새로운 Refresh Token은 HttpOnly Cookie로 교체됩니다.",
        "- Refresh Token이 없거나 유효하지 않은 경우 재발급할 수 없습니다.",
      ].join("\n"),
      responses: {
        200: "Access Token 및 Refresh Token 재발급 성공",
        401: "Refresh Token이 없거나 유효하지 않습니다.",
        403: "요청 Origin 검증에 실패했습니다.",
      },
    },

    /*
     * 로그아웃 API
     */
    "POST /logout": {
      summary: "로그아웃",
      description: [
        "현재 로그인 세션을 종료합니다.",
        "",
        "- Refresh Token은 HttpOnly Cookie에서 조회합니다.",
        "- CSRF 보호를 위해 요청의 Origin을 검증합니다.",
        "- 허용된 프론트엔드 Origin에서 요청해야 합니다.",
        "- 운영 환경에서는 Origin 헤더가 없거나 허용되지 않은 경우 요청이 거부됩니다.",
        "- Refresh Token이 존재하면 서버에 저장된 현재 세션을 무효화합니다.",
        "- 로그아웃 후 Refresh Token Cookie를 삭제합니다.",
        "- Refresh Token이 없는 경우에도 이미 로그아웃된 상태로 간주합니다.",
        "- 동일한 요청을 반복해도 같은 결과를 반환하도록 멱등성을 보장합니다.",
      ].join("\n"),
      responses: {
        200: "로그아웃 성공",
        403: "요청 Origin 검증에 실패했습니다.",
      },
    },
  },
});
