import { z } from "zod";

import { registerRouterDocs } from "../../../config/openapi-router";

import adminManagementRouter from "./admin-management.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(adminManagementRouter, {
  basePath: "/api/admin/admins",
  tag: "Admin Management",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "해당 요청을 수행할 관리자 권한이 없습니다.",
    404: "해당 관리자 계정을 찾을 수 없습니다.",
    409: "이미 요청한 상태로 처리된 관리자 계정입니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    /**
     * 일반 관리자 목록 조회
     */
    "GET /": {
      summary: "일반 관리자 목록 조회",
      description: [
        "SUPER_ADMIN이 관리 대상인 일반 ADMIN 목록을 조회합니다.",
        "",
        "- SUPER_ADMIN만 호출할 수 있습니다.",
        "- `AdminRole.ADMIN`인 일반 관리자만 조회합니다.",
        "- SUPER_ADMIN 계정은 목록에서 제외됩니다.",
        "- `keyword`: 관리자 이름 또는 이메일 부분 일치 검색입니다.",
        "- `status`: `ACTIVE` 또는 `SUSPENDED` 상태로 필터링합니다.",
        "- 상태는 User.isActive 값을 기준으로 판단합니다.",
        "- `page`: 페이지 번호이며 기본값은 1입니다.",
        "- `limit`: 페이지당 조회 개수이며 기본값은 20, 최대 100입니다.",
        "- 정렬은 관리자 생성일(createdAt) 최신순입니다.",
      ].join("\n"),
      responses: {
        200: "관리자 목록 조회 성공",
        403: "SUPER_ADMIN 권한이 없습니다.",
        422: "조회 조건이 올바르지 않습니다.",
      },
    },

    /**
     * 일반 관리자 상세 조회
     */
    "GET /:id": {
      summary: "일반 관리자 상세 조회",
      description: [
        "SUPER_ADMIN이 관리 대상인 일반 ADMIN의 상세 정보를 조회합니다.",
        "",
        "- SUPER_ADMIN만 호출할 수 있습니다.",
        "- 대상은 `AdminRole.ADMIN`인 일반 관리자만 가능합니다.",
        "- SUPER_ADMIN 계정은 일반 관리자 관리 대상에서 제외됩니다.",
        "- 관리자 ID는 UUID 형식이어야 합니다.",
        "- 관리자 이름, 이메일, 휴대전화 번호, 활성 상태, 생성일을 조회합니다.",
        "- 현재 상태는 User.isActive 값을 기준으로 판단합니다.",
        "- 해당 관리자의 정지/해제 이력(UserSuspension)을 함께 조회합니다.",
        "- 정지/해제 이력은 최신순으로 최대 5건을 반환합니다.",
        "- suspensionHistory.totalCount를 통해 전체 정지/해제 이력 개수를 확인할 수 있습니다.",
      ].join("\n"),
      responses: {
        200: "관리자 상세 조회 성공",
        403: "SUPER_ADMIN 권한이 없습니다.",
        404: "해당 관리자 계정을 찾을 수 없습니다.",
        422: "관리자 ID가 올바르지 않습니다.",
      },
    },

    /**
     * 일반 관리자 계정 생성
     */
    "POST /": {
      summary: "일반 관리자 계정 생성",
      description: [
        "SUPER_ADMIN이 일반 ADMIN 계정을 생성합니다.",
        "",
        "- SUPER_ADMIN만 호출할 수 있습니다.",
        "- 생성되는 User.role은 항상 `ADMIN`으로 고정됩니다.",
        "- 생성되는 AdminProfile.adminRole도 항상 `ADMIN`으로 고정됩니다.",
        "- 요청에서 `role` 또는 `adminRole`을 직접 지정할 수 없습니다.",
        "- 이메일과 휴대전화 번호는 기존 User와 중복될 수 없습니다.",
        "- User와 AdminProfile은 하나의 트랜잭션으로 생성됩니다.",
        "- 일반 ADMIN은 이 API를 호출할 수 없습니다.",
      ].join("\n"),
      responses: {
        201: "관리자 계정 생성 성공",
        403: "SUPER_ADMIN 권한이 없습니다.",
        409: "이미 사용 중인 이메일 또는 휴대전화 번호입니다.",
        422: "관리자 계정 입력값이 올바르지 않습니다.",
      },
    },

    /**
     * 일반 관리자 계정 정지/해제
     */
    "PATCH /:id/status": {
      summary: "일반 관리자 계정 정지/해제",
      description: [
        "SUPER_ADMIN이 일반 ADMIN 계정을 정지하거나 정지 해제합니다.",
        "",
        "- SUPER_ADMIN만 호출할 수 있습니다.",
        "- 대상은 `AdminRole.ADMIN`인 일반 관리자만 가능합니다.",
        "- SUPER_ADMIN 계정은 상태 변경 대상이 될 수 없습니다.",
        "- 비활성화된 관리자 계정은 정지하거나 정지 해제할 수 없습니다.",
        "- `SUSPEND`: User.isActive를 false로 변경하고 기존 ADMIN Refresh Token 세션을 강제 폐기합니다.",
        "- 기존 Access Token도 이후 요청에서 requireActiveAdmin을 통해 차단됩니다.",
        "- `RELEASE`: User.isActive를 true로 변경합니다.",
        "- 정지 해제 시 기존 Refresh Token은 복구하지 않으며 다시 로그인해야 합니다.",
        "- 정지/해제 이력은 UserSuspension에 기록합니다.",
        "- 상태 변경 행위는 ActivityLog에도 기록합니다.",
      ].join("\n"),
      responses: {
        200: "관리자 상태 변경 성공",
        403: "SUPER_ADMIN 권한이 없거나 SUPER_ADMIN 계정을 변경하려는 요청입니다.",
        404: "해당 관리자 계정을 찾을 수 없습니다.",
        409: "이미 요청한 상태이거나 비활성화된 관리자 계정입니다.",
        422: "입력값이 올바르지 않습니다.",
      },
    },

    /**
     * 일반 관리자 계정 비활성화
     */
    "PATCH /:id/deactivate": {
      summary: "일반 관리자 계정 비활성화",
      description: [
        "SUPER_ADMIN이 일반 ADMIN 계정의 사용을 종료합니다.",
        "",
        "- SUPER_ADMIN만 호출할 수 있습니다.",
        "- 대상은 `AdminRole.ADMIN`인 일반 관리자만 가능합니다.",
        "- SUPER_ADMIN 계정 자체는 비활성화할 수 없습니다.",
        "- 비활성화는 일시적인 정지와 구분되는 Soft Delete 조치입니다.",
        "- User.isActive를 false로 변경합니다.",
        "- User.deletedAt에 비활성화 시각을 기록합니다.",
        "- 정지된 관리자도 비활성화할 수 있습니다.",
        "- 비활성화된 계정은 정지 해제를 통해 다시 활성화할 수 없습니다.",
        "- 기존 ADMIN Refresh Token 세션을 모두 강제로 폐기합니다.",
        "- 기존 Access Token도 이후 관리자 API 요청에서 차단됩니다.",
        "- 비활성화 사유와 처리 행위는 ActivityLog에 기록합니다.",
        "- 비활성화는 UserSuspension의 정지/해제 이력에는 기록하지 않습니다.",
        "- 이미 비활성화된 관리자에 대한 중복 요청은 거부됩니다.",
      ].join("\n"),
      responses: {
        200: "관리자 계정 비활성화 성공",
        403: "SUPER_ADMIN 권한이 없거나 SUPER_ADMIN 계정을 비활성화하려는 요청입니다.",
        404: "해당 관리자 계정을 찾을 수 없습니다.",
        409: "이미 비활성화된 관리자 계정입니다.",
        422: "관리자 ID 또는 비활성화 사유가 올바르지 않습니다.",
      },
    },
  },
});
