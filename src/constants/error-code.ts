// 공통 에러 코드
export const ERROR_CODES = {
  BAD_REQUEST: {
    status: 400,
    code: "BAD_REQUEST",
    message: "잘못된 요청입니다.",
  },

  UNAUTHORIZED: {
    status: 401,
    code: "UNAUTHORIZED",
    message: "인증이 필요합니다.",
  },

  FORBIDDEN: {
    status: 403,
    code: "FORBIDDEN",
    message: "접근 권한이 없습니다.",
  },

  NOT_FOUND: {
    status: 404,
    code: "NOT_FOUND",
    message: "요청한 리소스를 찾을 수 없습니다.",
  },

  CONFLICT: {
    status: 409,
    code: "CONFLICT",
    message: "이미 존재하는 데이터입니다.",
  },

  INTERNAL_SERVER_ERROR: {
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "서버 내부 오류가 발생했습니다.",
  },

  BAD_GATEWAY: {
    status: 502,
    code: "BAD_GATEWAY",
    message: "외부 인증 서버와 통신 중 오류가 발생했습니다.",
  },

  OAUTH_EMAIL_ALREADY_EXISTS: {
    status: 409,
    code: "OAUTH_EMAIL_ALREADY_EXISTS",
    message: "동일한 이메일로 가입된 계정이 이미 존재합니다.",
  },

  VALIDATION_ERROR: {
    status: 422,
    code: "VALIDATION_ERROR",
    message: "입력값이 올바르지 않습니다.",
  },

  ACTIVE_REQUEST_EXISTS: {
    status: 409,
    code: "ACTIVE_REQUEST_EXISTS",
    message: "이미 진행 중인 견적 요청이 있습니다.",
  },

  INVALID_MOVE_DATE: {
    status: 400,
    code: "INVALID_MOVE_DATE",
    message: "이사 예정일은 오늘 이후여야 합니다.",
  },

  REGION_NOT_FOUND: {
    status: 400,
    code: "REGION_NOT_FOUND",
    message: "지원하지 않는 지역입니다.",
  },

  ESTIMATE_REQUEST_NOT_FOUND: {
    status: 404,
    code: "ESTIMATE_REQUEST_NOT_FOUND",
    message: "견적 요청을 찾을 수 없습니다.",
  },

  REQUEST_NOT_EDITABLE: {
    status: 409,
    code: "REQUEST_NOT_EDITABLE",
    message: "견적이 도착한 요청은 수정할 수 없습니다.",
  },

  MOVER_NOT_FOUND: {
    status: 404,
    code: "MOVER_NOT_FOUND",
    message: "존재하지 않는 기사님입니다.",
  },

  ALREADY_DESIGNATED: {
    status: 409,
    code: "ALREADY_DESIGNATED",
    message: "이미 지정한 기사님입니다.",
  },

  DESIGNATION_LIMIT_EXCEEDED: {
    status: 409,
    code: "DESIGNATION_LIMIT_EXCEEDED",
    message: "지정 견적은 최대 3명까지 요청할 수 있습니다.",
  },

  // 2026.07.24 정슬기 - [추가] 받은 견적 상세·확정 API용 에러 코드
  ESTIMATE_NOT_FOUND: {
    status: 404,
    code: "ESTIMATE_NOT_FOUND",
    message: "견적을 찾을 수 없습니다.",
  },

  ESTIMATE_ALREADY_CONFIRMED: {
    status: 409,
    code: "ESTIMATE_ALREADY_CONFIRMED",
    message: "이미 확정된 견적이 있어 추가로 확정할 수 없습니다.",
  },

  ESTIMATE_NOT_CONFIRMABLE: {
    status: 409,
    code: "ESTIMATE_NOT_CONFIRMABLE",
    message: "확정할 수 없는 견적입니다.",
  },

  // 2026.07.28 심현수 - [추가]관리자 공지사항
  NOTICE_NOT_FOUND: {
    status: 404,
    code: "NOTICE_NOT_FOUND",
    message: "공지를 찾을 수 없습니다.",
  },

  // 2026.07.29 심현수 - [추가]관리자 FAQ
  FAQ_NOT_FOUND: {
    status: 404,
    code: "FAQ_NOT_FOUND",
    message: "FAQ를 찾을 수 없습니다.",
  },

  // 2026.07.30 심현수 - [추가] 1:1 문의(QNA)
  INQUIRY_NOT_FOUND: {
    status: 404,
    code: "INQUIRY_NOT_FOUND",
    message: "문의를 찾을 수 없습니다.",
  },
  INQUIRY_CLOSED: {
    status: 409,
    code: "INQUIRY_CLOSED",
    message: "이미 종료된 문의입니다. 새 문의를 등록해 주세요.",
  },
} as const;

// ErrorCode의 key 타입
export type ErrorCode = keyof typeof ERROR_CODES;
