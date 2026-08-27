import { z } from "zod";

import { registerRouterDocs } from "../../../../config/openapi-router";
import adminMoverRouter from "./movers.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(adminMoverRouter, {
  basePath: "/api/admin/movers",
  tag: "Mover (Admin)",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "관리자 권한이 없습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /": {
      summary: "기사님 목록 조회",
      description: [
        "관리자가 기사님(MOVER) 목록을 검색·필터링·페이지네이션하여 조회합니다.",
        "응답에는 계정 휴대폰 번호를 포함합니다.",
        "",
        "- 각 항목의 `openInquiryCount`는 기사님이 접수한 문의 중 관리자의 답변을 기다리는 `OPEN` 상태 건수입니다.",
        "- `keyword`: 이름·닉네임·이메일 부분일치(대소문자 무시)",
        "- `status`: ACTIVE | SUSPENDED | WITHDRAWN (미지정 시 탈퇴 회원 제외)",
        "- `isProfileCompleted`: 프로필 완료 여부 (`true` | `false`)",
        "- `regionId` / `moveType`: 서비스 가능 지역·제공 이사 유형 필터",
        "- `fromDate` / `toDate`: 가입일 기간 검색 (YYYY-MM-DD, KST 기준)",
        "- `sorts`: 반복 query로 전달하는 정렬 기준(최대 5개, 같은 기준 중복 불가). 예: `sorts=CONFIRMED_DESC&sorts=RATING_DESC`",
        "  - 앞에 전달한 값부터 우선 정렬합니다. `sorts`를 생략하면 `CREATED_AT_DESC`(최신 가입순)를 적용합니다.",
        "  - `CREATED_AT_DESC` 또는 `CREATED_AT_ASC`를 지정하지 않으면 `createdAt DESC`, `id ASC`를 보조 정렬로 적용합니다.",
        "  - 허용값: `CREATED_AT_DESC` | `CREATED_AT_ASC` | `PENDING_DESC` | `PENDING_ASC` | `OPEN_INQUIRY_DESC` | `OPEN_INQUIRY_ASC` | `CONFIRMED_DESC` | `CONFIRMED_ASC` | `RATING_DESC` | `RATING_ASC` | `CAREER_DESC` | `CAREER_ASC`",
      ].join("\n"),
      responses: { 200: "조회 성공" },
    },
    "GET /{id}": {
      summary: "기사님 상세 조회",
      description: [
        "관리자가 기사님(MOVER)의 계정·프로필과 주요 활동 이력을 조회합니다.",
        "리뷰 통계는 전체·공개·숨김 리뷰 수와 공개 리뷰 평균 별점을 제공합니다. 프로필의 `reviewCount`, `averageRating`은 공개 리뷰 기준 값입니다.",
        "진행 중 견적은 전송(SENT)·확정(CONFIRMED) 상태, 최근 견적은 만료·취소 또는 이사 완료 거래의 최신 5건을 제공합니다. 각 견적에는 대상 고객 식별 정보, 이사 유형·예정일·견적 등록일을 포함하며, 확정 견적에는 확정 시각을, 최근 견적에는 만료·취소 시각을 함께 제공합니다.",
        "신고 이력은 신고한 내역(`filed`)과 피신고 내역(`received`)을 각각 최신 5건과 전체 건수로 제공합니다.",
        "정지·해제 이력에는 조치 종류·사유·내부 메모·처리 시각과 처리 관리자 이름을 포함합니다.",
        "문의 이력은 전체·미처리 건수와 함께 최대 5건을 반환합니다. 관리자의 답변을 기다리는 `OPEN` 문의를 우선하고, 각 항목에는 분류·제목·상태·최근 메시지 시각·생성 시각·처리 관리자 이름을 포함합니다.",
        "Customer ID 또는 존재하지 않는 ID는 MOVER_NOT_FOUND를 반환합니다.",
      ].join("\n"),
      responses: { 200: "조회 성공", 404: "기사를 찾을 수 없습니다." },
    },
    "PATCH /{id}/status": {
      summary: "기사 계정 정지/해제",
      description: [
        "관리자가 기사님(MOVER)의 계정 상태를 정지 또는 해제합니다.",
        "- `SUSPEND`: OPEN 견적 요청에 전송한 SENT 견적과 PENDING 수정 요청을 취소하고, 고객에게 알림을 보냅니다.",
        "- `RELEASE`: 계정만 활성화하며, 정지 때 취소된 견적 데이터는 복구하지 않습니다.",
        "- `reason`: 처리 사유입니다. 정지(`SUSPEND`) 사유는 해당 사용자의 일반 로그인·OAuth 로그인·Refresh Token 재발급 차단 응답에만 노출되며, 해제(`RELEASE`) 사유는 관리자 이력용으로만 저장됩니다.",
        "- `internalNote`: 관리자 전용 내부 메모이며 사용자 또는 정지로 영향을 받은 상대방에게 노출되지 않습니다.",
        "- 탈퇴 회원, Customer, 자기 자신은 상태 변경할 수 없습니다.",
      ].join("\n"),
      responses: {
        200: "처리 성공",
        401: "인증이 필요합니다.",
        403: "자기 자신의 계정 상태는 변경할 수 없습니다.",
        404: "기사를 찾을 수 없습니다.",
        409: "MOVER_STATUS_ALREADY_PROCESSED - 이미 요청한 상태로 처리된 기사님입니다.",
        422: "입력값이 올바르지 않습니다.",
      },
    },
  },
});
