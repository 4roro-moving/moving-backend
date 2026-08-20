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
  // 첫 페이지에서만 전체 건수. 커서 다음 페이지는 count를 생략해 null일 수 있습니다.
  totalCount: number | null;
  hasNext: boolean;
  nextCursor: string | null;
  page?: never;
  totalPages?: never;
}

export type ResponsePagination = Pagination | CursorPagination;

// 성공 응답 공통 타입
export interface ApiResponse<T = unknown> {
  success?: true;
  message?: string;
  data?: T | null;
  pagination?: ResponsePagination;
}

export interface ErrorBody {
  code: string;
  message: string;
  data?: unknown;
}

// 에러 응답 공통 타입
export interface ErrorResponse {
  success: false;
  error: ErrorBody;
  path: string;
  method: string;
  timestamp: string;
}

// 유효성 검사 에러 상세 타입
export interface ValidationErrorDetail {
  path: string;
  message: string;
}
