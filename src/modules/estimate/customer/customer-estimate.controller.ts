import type { Request, RequestHandler } from "express";

import { AppError } from "../../../lib/app-error";
import { receivedEstimateService } from "./customer-estimate.service";
import type {
  ConfirmReceivedEstimateParam,
  PendingEstimateQuery,
  ReceivedEstimateDetailParam,
  ReceivedEstimateIdParam,
  ReceivedEstimateRequestIdParam,
} from "./customer-estimate.type";

/*
2026.07.23 add 김성현
받은 견적 목록 요청 처리, 상세 요청 처리, 받은 견적 확정 요청 처리
*/

// 2026.07.24 정슬기 - [수정] dev pull 충돌 병합 (섹션 주석·패널/estimateId API 모두 유지)

function getCustomerId(req: Request) {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

// =============================================================================
// 고객: 기사에게 받은 견적 목록·상세 조회 및 견적 확정
// =============================================================================

// 2026.07.27 add 김성현
// 대기 중인 견적 목록 요청 처리
const getPendingEstimateRequests: RequestHandler = async (req, res) => {
  const query = res.locals.query as PendingEstimateQuery;
  const result = await receivedEstimateService.getPendingEstimateRequests(
    getCustomerId(req),
    query,
  );

  res.status(200).json({
    success: true,
    data: result.sections,
    pagination: result.pagination,
  });
};

// 2026.07.24 정슬기 - [추가] 받은 견적 패널 목록 요청 처리
const getReceivedEstimatePanels: RequestHandler = async (req, res, next) => {
  try {
    const result = await receivedEstimateService.getReceivedEstimatePanels(getCustomerId(req));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 견적 요청 단위의 받은 견적 목록 조회
 */
const getReceivedEstimateList: RequestHandler = async (req, res, next) => {
  try {
    const { estimateRequestId } = res.locals.params as ReceivedEstimateRequestIdParam;

    const result = await receivedEstimateService.getReceivedEstimateList({
      estimateRequestId,
      customerId: getCustomerId(req),
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 견적 요청 단위의 받은 견적 상세 조회
 */
const getReceivedEstimateDetail: RequestHandler = async (req, res, next) => {
  try {
    const { estimateRequestId, estimateId } = res.locals.params as ReceivedEstimateDetailParam;

    const result = await receivedEstimateService.getReceivedEstimateDetail({
      estimateRequestId,
      estimateId,
      customerId: getCustomerId(req),
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// 2026.07.24 정슬기 - [추가] estimateId 기준 받은 견적 상세 요청 처리
const getReceivedEstimateDetailById: RequestHandler = async (req, res, next) => {
  try {
    const { estimateId } = res.locals.params as ReceivedEstimateIdParam;

    const result = await receivedEstimateService.getReceivedEstimateDetailById(
      estimateId,
      getCustomerId(req),
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 견적 요청 단위의 받은 견적 확정
 */
const confirmReceivedEstimate: RequestHandler = async (req, res, next) => {
  try {
    const { estimateRequestId, estimateId } = res.locals.params as ConfirmReceivedEstimateParam;

    const result = await receivedEstimateService.confirmReceivedEstimate({
      estimateRequestId,
      estimateId,
      customerId: getCustomerId(req),
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// 2026.07.24 정슬기 - [추가] estimateId 기준 확정 요청 처리 (원격 확정 서비스 재사용)
const confirmReceivedEstimateById: RequestHandler = async (req, res, next) => {
  try {
    const { estimateId } = res.locals.params as ReceivedEstimateIdParam;

    const result = await receivedEstimateService.confirmReceivedEstimateById(
      estimateId,
      getCustomerId(req),
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const customerEstimateController = {
  getPendingEstimateRequests,
  getReceivedEstimatePanels,
  getReceivedEstimateList,
  getReceivedEstimateDetail,
  getReceivedEstimateDetailById,
  confirmReceivedEstimate,
  confirmReceivedEstimateById,
};
