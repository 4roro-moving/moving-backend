// 페이지네이션 응답 타입
export interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  nextCursor?: never;
}

export interface CursorPagination {
  limit: number;
  totalCount: number;
  hasNext: boolean;
  nextCursor: string | null;
  page?: never;
  totalPages?: never;
}

// 성공 응답 공통 타입
export interface ApiResponse<T = unknown> {
  message?: string;
  data?: T;
  pagination?: Pagination | CursorPagination;
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
