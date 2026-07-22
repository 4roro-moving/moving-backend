import type { Response } from "express";
import type { ApiResponse } from "../types/response.type";

// 성공 응답 전송
export function sendResponse<T>(res: Response, statusCode: number, data?: T, message?: string) {
  const response: ApiResponse<T> = {};

  if (message !== undefined) {
    response.message = message;
  }

  if (data !== undefined) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
}
