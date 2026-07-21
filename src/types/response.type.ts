// 성공 응답 공통 타입
export interface ApiResponse<T = unknown> {
  message?: string;
  data?: T;
}

// 에러 응답 공통 타입
export interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

// 유효성 검사 에러 상세 타입
export interface ValidationErrorDetail {
  field: string;
  message: string;
}
