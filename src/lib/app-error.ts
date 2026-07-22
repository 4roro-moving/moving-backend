import { ERROR_CODES, type ErrorCode } from "../constants/error-code";

type AppErrorOptions = {
  message?: string;
  data?: unknown;
};

// 서비스 계층에서 사용하는 공통 예외 클래스
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly data?: unknown;

  constructor(errorCode: ErrorCode, options: AppErrorOptions = {}) {
    const error = ERROR_CODES[errorCode];

    super(options.message ?? error.message);

    this.name = "AppError";
    this.status = error.status;
    this.code = error.code;
    this.data = options.data;

    // Stack Trace 유지
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}
