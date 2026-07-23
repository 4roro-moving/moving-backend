import type { Request, RequestHandler } from "express";

import { AppError } from "../../lib/app-error";
import { moverEstimateRequestService, receivedEstimateService } from "./estimate.service";
import type {
  ConfirmReceivedEstimateParam,
  MoverEstimateRequestListQuery,
  ReceivedEstimateDetailParam,
  ReceivedEstimateRequestIdParam,
} from "./estimate.type";

/* 
2026.07.21 add 윤소정
*/

/* 
2026.07.23 add 김성현
받은 견적 목록 요청 처리, 상세 요청 처리, 받은 견적 확정 요청 처리
*/

//로그인한 기사 ID
function getMoverId(req: Request) {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

function getCustomerId(req: Request) {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED");
  }

  return req.user.id;
}

//받은 견적 요청 목록 조회 함수
const getList: RequestHandler = async (req, res, next) => {
  try {
    const moverId = getMoverId(req);
    const query = res.locals.query as MoverEstimateRequestListQuery;
    const result = await moverEstimateRequestService.getList(moverId, query);

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

export const estimateController = {
  getList,
  getReceivedEstimateList,
  getReceivedEstimateDetail,
  confirmReceivedEstimate,
};
