import type { Response } from "express";
import type { ApiResponse, Pagination } from "../types/response.type";

type SendResponseOptions = {
  message?: string;
  pagination?: Pagination;
};

// 성공 응답 전송
export function sendResponse<T>(
  res: Response,
  statusCode: number,
  data?: T,
  options: SendResponseOptions = {},
) {
  const response: ApiResponse<T> = {};

  if (options.message !== undefined) {
    response.message = options.message;
  }

  if (data !== undefined) {
    response.data = data;
  }

  if (options.pagination !== undefined) {
    response.pagination = options.pagination;
  }

  return res.status(statusCode).json(response);
}
