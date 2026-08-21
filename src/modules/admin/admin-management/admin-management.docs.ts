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

    "PATCH /:id/status": {
      summary: "일반 관리자 계정 정지/해제",
      description: [
        "SUPER_ADMIN이 일반 ADMIN 계정을 정지하거나 정지 해제합니다.",
        "",
        "- SUPER_ADMIN만 호출할 수 있습니다.",
        "- 대상은 `AdminRole.ADMIN`인 일반 관리자만 가능합니다.",
        "- SUPER_ADMIN 계정은 상태 변경 대상이 될 수 없습니다.",
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
        409: "이미 요청한 상태로 처리된 관리자 계정입니다.",
        422: "입력값이 올바르지 않습니다.",
      },
    },
  },
});
