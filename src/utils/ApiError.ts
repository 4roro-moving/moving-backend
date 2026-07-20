import { ERROR_CODES, type ErrorCodeKey } from "../constants/errorCodes";

type ApiErrorOptions = {
  message?: string;
  data?: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly data?: unknown;

  constructor(errorCodeKey: ErrorCodeKey, options: ApiErrorOptions = {}) {
    const errorCode = ERROR_CODES[errorCodeKey];

    super(options.message ?? errorCode.message);

    this.name = "ApiError";
    this.status = errorCode.status;
    this.code = errorCode.code;
    this.data = options.data;

    Error.captureStackTrace(this, ApiError);
  }
}
