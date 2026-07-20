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
} as const;

export type ErrorCodeKey = keyof typeof ERROR_CODES;
