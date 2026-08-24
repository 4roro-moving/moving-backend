import { z } from "zod";

import { registerRouterDocs } from "../../../../config/openapi-router";

import adminCustomerRouter from "./customers.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(adminCustomerRouter, {
  basePath: "/api/admin/users",
  tag: "Customer (Admin)",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "고객 목록 조회",
      description: [
        "관리자가 일반 고객(CUSTOMER) 목록을 검색·필터링·페이지네이션하여 조회합니다.",
        "",
        "- 각 항목의 `openInquiryCount`는 고객이 접수한 문의 중 관리자의 답변을 기다리는 `OPEN` 상태 건수입니다.",
        "- `keyword`: 이름·이메일 부분일치(대소문자 무시)",
        "- `status`: ACTIVE | SUSPENDED | WITHDRAWN (미지정 시 탈퇴 회원 제외)",
        "- `authProvider`: LOCAL | GOOGLE | NAVER | KAKAO",
        "- `isProfileCompleted`: 프로필 완료 여부 (`true` | `false`)",
        "- `fromDate` / `toDate`: 가입일 기간 검색 (YYYY-MM-DD, KST 기준)",
        "- `sorts`: 반복 query로 전달하는 정렬 기준(최대 5개, 같은 기준 중복 불가). 예: `sorts=PENDING_DESC&sorts=CREATED_AT_ASC`",
        "  - 앞에 전달한 값부터 우선 정렬합니다. `sorts`를 생략하면 `CREATED_AT_DESC`(최신 가입순)를 적용합니다.",
        "  - `CREATED_AT_DESC` 또는 `CREATED_AT_ASC`를 지정하지 않으면 `createdAt DESC`, `id ASC`를 보조 정렬로 적용합니다.",
        "  - 허용값: `CREATED_AT_DESC` | `CREATED_AT_ASC` | `PENDING_DESC` | `PENDING_ASC` | `OPEN_INQUIRY_DESC` | `OPEN_INQUIRY_ASC`",
        "- 기사님 목록은 `GET /api/admin/movers` 에서 별도 제공",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },
    "GET /:id": {
      summary: "고객 상세 조회",
      description: [
        "관리자가 특정 고객(CUSTOMER)의 상세 정보를 조회합니다.",
        "",
        "- 계정/프로필 + 견적·리뷰·신고·정지 이력 요약을 함께 반환합니다. 견적 요청은 최대 5건을 반환하며, 활성 요청이 있으면 이를 우선합니다. 나머지는 생성일 최신순입니다.",
        "- 견적 요청 이력에는 만료·취소·완료 시각, 취소 주체(`canceledBy`), 상태별 견적 건수, 확정 견적(기사·금액·확정 시각·취소 가능 여부)을 포함합니다. 확정 견적이 없으면 `confirmedEstimate`는 null입니다.",
        "- 정지·해제 이력에는 조치 종류·사유·내부 메모·처리 시각과 처리 관리자 이름을 포함합니다.",
        "- 문의 이력은 전체·미처리 건수와 함께 최대 5건을 반환합니다. 관리자의 답변을 기다리는 `OPEN` 문의를 우선하고, 각 항목에는 분류·제목·상태·최근 메시지 시각·생성 시각·처리 관리자 이름을 포함합니다.",
        "- `role=CUSTOMER` 만 조회 가능하며, Mover 또는 존재하지 않는 id 는 404입니다.",
        "- 탈퇴 회원(`WITHDRAWN`)도 상세 조회는 가능합니다.",
      ].join("\n"),
      responses: {
        200: "조회 성공",
        404: "해당 회원을 찾을 수 없습니다.",
        422: "회원 ID 형식이 올바르지 않습니다.",
      },
    },
    "PATCH /:id/status": {
      summary: "고객 계정 정지/해제",
      description: [
        "관리자가 일반 고객(CUSTOMER)의 계정 상태를 정지 또는 해제합니다.",
        "- `SUSPEND`: OPEN 견적 요청과 연관 SENT 견적/PENDING 수정 요청을 취소합니다.",
        "- `RELEASE`: 계정만 활성화하며, 기존 자동 취소 데이터는 복구하지 않습니다.",
        "- `reason`: 처리 사유입니다. 정지(`SUSPEND`) 사유는 해당 사용자가 로그인할 때만 노출되며, 해제(`RELEASE`) 사유는 관리자 이력용으로만 저장됩니다.",
        "- `internalNote`: 관리자 전용 내부 메모이며 사용자 또는 정지로 영향을 받은 상대방에게 노출되지 않습니다.",
        "- 탈퇴 회원, Mover, 자기 자신은 상태 변경할 수 없습니다.",
      ].join("\n"),
      responses: {
        200: "처리 성공",
        403: "자기 자신의 계정 상태는 변경할 수 없습니다.",
        404: "해당 고객을 찾을 수 없습니다.",
        409: "CUSTOMER_STATUS_ALREADY_PROCESSED - 이미 요청한 상태로 처리된 회원입니다.",
        422: "입력값이 올바르지 않습니다.",
      },
    },
  },
});
